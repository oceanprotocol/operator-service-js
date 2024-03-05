import e, { Request, Response } from 'express'
import { Readable } from 'stream'
import { parseHeader } from 'parse-headers' // Assuming this is installed
import { Web3 } from 'web3'
import { KeyAPI, Signature, ECDSA } from 'eth-crypto'
import { InvalidSignatureError } from './operator_service/exceptions'
import { getNonceForCertainProvider, updateNonceForProvider } from '../database/index'
import { RequiredAttributes } from '../@types'

const logger = console // Replace with your logging library
const keys = new KeyAPI(new ECDSA(new Web3().eth))

// Function to generate a new ID without a prefix
export function generateNewId(): string {
  return uuid.v4().toString()
}

// Function to create a compute job object
export function createComputeJob(
  workflow: object,
  executionId: string,
  namespace: string
): object {
  const execution: object = {}
  execution['apiVersion'] = 'v0.0.1'
  execution['kind'] = 'WorkFlow'
  execution['metadata'] = {}
  execution['metadata']['name'] = executionId
  execution['metadata']['namespace'] = namespace
  execution['metadata']['labels'] = {}
  execution['metadata']['labels']['workflow'] = executionId
  execution['spec'] = {}
  execution['spec']['metadata'] = workflow
  return execution
}

// Function to check required attributes in a request
export function checkRequiredAttributes(
  requiredAttributes: string[],
  data: any,
  method: string
): RequiredAttributes {
  logger.debug(`Got ${method} request: ${JSON.stringify(data)}`)
  if (!data || typeof data !== 'object') {
    logger.error(`${method} request failed: data is empty.`)
    return { message: 'Payload seems empty.', statusCode: 400 }
  }

  for (const attribute of requiredAttributes) {
    if (!(attribute in data)) {
      logger.error(`${method} request failed: required attribute ${attribute} missing.`)
      return {
        message: `"${attribute}" is required in the call to ${method}`,
        statusCode: 400
      }
    }
  }

  return { message: '', statusCode: null }
}

// Function to get the signer of a message
export function getSigner(signature: string, message: string): string {
  const signatureBytes = Web3.utils.hexToBytes(signature)
  const newSignature =
    signatureBytes[64] === 27
      ? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([0])])
      : signatureBytes[64] === 28
        ? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([1])])
        : signatureBytes
  const signatureObject = keys.Signature.fromSignatureBuffer(newSignature)
  const messageHash = Web3.utils.solidityKeccak(['bytes'], [message])
  const prefix = Buffer.from('\x19Ethereum Signed Message:\n32')
  const signableHash = Web3.utils.solidityKeccak(
    ['bytes', 'bytes'],
    [prefix, messageHash]
  )
  const vkey = keys.recoverPublicKey(signableHash, signatureObject)
  return vkey.getAddress().toString()
}

// Function to check if signature verification is required
export function isVerifySignatureRequired(): boolean {
  try {
    return process.env.SIGNATURE_REQUIRED === '1'
  } catch (error) {
    return false
  }
}

// Function to get a list of allowed providers
export function getListOfAllowedProviders(): string[] {
  try {
    const allowedList = JSON.parse(process.env.ALLOWED_PROVIDERS || '[]')
    if (!Array.isArray(allowedList)) {
      logger.error('Failed loading ALLOWED_PROVIDERS')
      return []
    }
    return allowedList.map((p) => p.toLowerCase())
  } catch (error) {
    logger.error(`Error parsing ALLOWED_PROVIDERS: ${error}`)
    return []
  }
}

// Function to validate provider signature (continued from previous part)
export async function processProviderSignatureValidation(
  signature: string,
  originalMsg: string,
  nonce: number
): Promise<SignatureValidation> {
  try {
    const address = getSigner(signature, originalMsg)

    const dbNonce = await getNonceForCertainProvider(address)

    if (dbNonce && nonce <= dbNonce) {
      const errorMessage = `Invalid signature expected nonce (${dbNonce}) > current nonce (${nonce}).`
      logger.error(errorMessage)
      throw new InvalidSignatureError(errorMessage)
    } else {
      await updateNonceForProvider(nonce.toString(), address)
    }

    if (!signature || !originalMsg) {
      return {
        message: '`providerSignature` of agreementId is required.',
        statusCode: 400,
        address: null
      }
    }

    originalMsg = `${originalMsg}${nonce}`

    if (!getSigner(signature, originalMsg)) {
      return {
        message: 'Invalid signature.',
        statusCode: 400,
        address: null
      }
    }
    if (isVerifySignatureRequired()) {
      const allowedProviders = getListOfAllowedProviders()
      if (!allowedProviders.includes(address.toLowerCase())) {
        const errorMessage = `Invalid signature ${signature} of documentId ${originalMsg},
              the signing ethereum account ${address} is not authorized to use this service.`
        return {
          message: errorMessage,
          statusCode: 401,
          address: null
        }
      }
    }
    return {
      message: '',
      statusCode: null,
      address: address
    }
  } catch (error) {
    logger.error('Error processing provider signature validation:', error)
    return {
      message: 'Internal server error',
      statusCode: 500,
      address: null
    }
  }
}

// Function to retrieve compute resources from environment variables
export function getComputeResources(): { [key: string]: string } {
  const resources: { [key: string]: string } = {}
  resources['inputVolumesize'] = process.env.INPUT_VOLUMESIZE || '1Gi'
  resources['outputVolumesize'] = process.env.OUTPUT_VOLUMESIZE || '1Gi'
  resources['adminlogsVolumesize'] = process.env.ADMINLOGS_VOLUMESIZE || '1Gi'
  resources['requests_cpu'] = process.env.REQUESTS_CPU || '200m'
  resources['requests_memory'] = process.env.REQUESTS_MEMORY || '100Mi'
  resources['limits_cpu'] = process.env.LIMITS_CPU || '1'
  resources['limits_memory'] = process.env.LIMITS_MEMORY || '500Mi'
  return resources
}

// Function to retrieve namespace configurations from environment variables
export function getNamespaceConfigs(): { [key: string]: string } {
  const resources: { [key: string]: string } = {}
  resources['namespace'] = process.env.DEFAULT_NAMESPACE || 'ocean-compute'
  return resources
}

export async function checkAdmin(admin: string | undefined): Promise<[string, number]> {
  try {
    // Access and parse ALLOWED_ADMINS environment variable safely
    const allowedAdmins: string[] = JSON.parse(process.env.ALLOWED_ADMINS || '[]')

    // Validate input and address missing admin
    if (!admin) {
      const errorMessage = 'Admin header is empty.'
      logger.error(errorMessage)
      return [errorMessage, 400]
    }

    // Check if admin address is authorized (case-insensitive)
    if (!allowedAdmins.includes(admin.toLowerCase())) {
      const errorMessage = 'Access admin route failed due to invalid admin address.'
      logger.error(errorMessage)
      return [errorMessage, 401]
    }

    // Valid admin, log success and return success message
    logger.info('Valid admin.')
    return ['Valid admin.', 200]
  } catch (error) {
    logger.error('Error checking admin:', error)
    return ['Internal server error', 500] // Return generic error for unexpected issues
  }
}

/**
 * Sanitizes objects to send them to provider by recursively converting Decimal and float values to strings.
 *
 * @param d The object to be sanitized. Can be a dict, list, tuple, set, str, int, float, or None.
 * @returns The sanitized object.
 */
export function sanitizeResponseForProvider(d: any): any {
  if (d instanceof Decimal) {
    return d.toString() // Use toString() for Decimal objects
  } else if (typeof d === 'number' && Number.isFinite(d)) {
    // Check for finite numbers
    return d.toString() // Convert finite numbers to strings
  } else if (typeof d === 'object' && d !== null) {
    // Ensure non-null object
    if (Array.isArray(d)) {
      return d.map(sanitizeResponseForProvider) // Sanitize elements in arrays
    } else {
      return Object.fromEntries(
        Object.entries(d).map(([key, value]) => [key, sanitizeResponseForProvider(value)])
      ) // Sanitize keys and values in dictionaries
    }
  } else {
    return d // Non-numeric, non-object values remain unchanged
  }
}

export async function buildDownloadResponse(
  request: Request,
  requestsSession: any, // Replace with the appropriate request library's session type
  url: string,
  contentType?: string
): Promise<Response> {
  try {
    const downloadRequestHeaders: Record<string, string> = {}
    let downloadResponseHeaders: Record<string, string> = {}

    const isRangeRequest = !!request.headers.range

    if (isRangeRequest) {
      downloadRequestHeaders['Range'] = request.headers.range
      downloadResponseHeaders = downloadRequestHeaders
    }

    // IPFS utils
    const ipfsXApiKey = process.env.X_API_KEY
    if (ipfsXApiKey) {
      downloadRequestHeaders['X-API-KEY'] = ipfsXApiKey
    }
    const ipfsClientId = process.env.CLIENT_ID
    if (ipfsClientId) {
      downloadRequestHeaders['CLIENT-ID'] = ipfsClientId
    }

    const response = await requestsSession.get(url, {
      headers: downloadRequestHeaders,
      stream: true,
      timeout: 3000 // Convert timeout to milliseconds
    })

    if (!isRangeRequest) {
      let filename = url.split('/').slice(-1)[0]

      const contentDispositionHeader = response.headers.get('content-disposition')
      if (contentDispositionHeader) {
        const [_, contentDispositionParams] = parseHeader(contentDispositionHeader)
        const contentFilename = contentDispositionParams.get('filename')
        if (contentFilename) {
          filename = contentFilename
        }
      }

      const contentTypeHeader = response.headers.get('content-type')
      if (contentTypeHeader) {
        contentType = contentTypeHeader
      }

      const [fileExt, mimeType] = getContentTypeAndExtension(filename, contentType)

      if (mimeType) {
        downloadResponseHeaders['Content-Type'] = mimeType
      }

      downloadResponseHeaders['Content-Disposition'] = `attachment;filename="${filename}"`
      downloadResponseHeaders['Access-Control-Expose-Headers'] = 'Content-Disposition'
    }

    const generate = function* (_response: Readable): Generator<Uint8Array | undefined> {
      for (const chunk of _response.readable) {
        if (chunk) {
          yield chunk
        }
      }
    }

    return new Response(generate(response), response.status, downloadResponseHeaders)
  } catch (error) {
    logger.error(`Error preparing file download response: ${error}`)
    throw error // Re-throw to indicate the download failed
  }
}

function getContentTypeAndExtension(
  filename: string,
  contentType?: string
): [string | undefined, string | undefined] {
  const fileExt = path.extname(filename).toLowerCase()
  if (fileExt && !contentType) {
    return [mimetypes.guessType(filename)[0], fileExt]
  } else if (!fileExt && contentType) {
    const extension = mimetypes.guessExtension(contentType)
    return [contentType, extension]
  }
  return [contentType, undefined]
}
