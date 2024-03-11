import e, { Request, Response } from "express";
import { Readable } from "stream";
import { parseHeader } from "parse-headers"; // Assuming this is installed
import { Web3 } from "web3";
import { KeyAPI, Signature, ECDSA } from "eth-crypto";
import { InvalidSignatureError } from "./operator_service/exceptions";
import {
	getNonceForCertainProvider,
	updateNonceForProvider,
} from "../database/index";
import { RequiredAttributes, SignatureValidation } from "../@types";

const keys = new KeyAPI(new ECDSA(new Web3().eth));

// Function to generate a new ID without a prefix
export function generateNewId(): string {
	return uuid.v4().toString();
}

// Function to get the signer of a message
export function getSigner(signature: string, message: string): string {
	const signatureBytes = Web3.utils.hexToBytes(signature);
	const newSignature =
		signatureBytes[64] === 27
			? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([0])])
			: signatureBytes[64] === 28
				? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([1])])
				: signatureBytes;
	const signatureObject = keys.Signature.fromSignatureBuffer(newSignature);
	const messageHash = Web3.utils.solidityKeccak(["bytes"], [message]);
	const prefix = Buffer.from("\x19Ethereum Signed Message:\n32");
	const signableHash = Web3.utils.solidityKeccak(
		["bytes", "bytes"],
		[prefix, messageHash]
	);
	const vkey = keys.recoverPublicKey(signableHash, signatureObject);
	return vkey.getAddress().toString();
}

export function isVerifySignatureRequired(): boolean {
	try {
		return process.env.SIGNATURE_REQUIRED === "1";
	} catch (error) {
		return false;
	}
}

export async function processProviderSignatureValidation(
	signature: string,
	originalMsg: string,
	nonce: number
): Promise<SignatureValidation> {
	try {
		const address = getSigner(signature, originalMsg);

		const dbNonce = await getNonceForCertainProvider(address);

		if (dbNonce && nonce <= dbNonce) {
			const errorMessage = `Invalid signature expected nonce (${dbNonce}) > current nonce (${nonce}).`;
			console.error(errorMessage);
			throw new InvalidSignatureError(errorMessage);
		} else {
			await updateNonceForProvider(nonce.toString(), address);
		}

		if (!signature || !originalMsg) {
			return {
				message: "`providerSignature` of agreementId is required.",
				statusCode: 400,
				address: null,
			};
		}

		originalMsg = `${originalMsg}${nonce}`;

		if (!getSigner(signature, originalMsg)) {
			return {
				message: "Invalid signature.",
				statusCode: 400,
				address: null,
			};
		}
		if (isVerifySignatureRequired()) {
			const allowedProviders = getListOfAllowedProviders();
			if (!allowedProviders.includes(address.toLowerCase())) {
				const errorMessage = `Invalid signature ${signature} of documentId ${originalMsg},
              the signing ethereum account ${address} is not authorized to use this service.`;
				return {
					message: errorMessage,
					statusCode: 401,
					address: null,
				};
			}
		}
		return {
			message: "",
			statusCode: null,
			address: address,
		};
	} catch (error) {
		console.error("Error processing provider signature validation:", error);
		return {
			message: "Internal server error",
			statusCode: 500,
			address: null,
		};
	}
}

export async function buildDownloadResponse(
	request: Request,
	requestsSession: any,
	url: string,
	contentType?: string
): Promise<Response> {
	try {
		const downloadRequestHeaders: Record<string, string> = {};
		let downloadResponseHeaders: Record<string, string> = {};

		const isRangeRequest = !!request.headers.range;

		if (isRangeRequest) {
			downloadRequestHeaders["Range"] = request.headers.range;
			downloadResponseHeaders = downloadRequestHeaders;
		}

		// IPFS utils
		const ipfsXApiKey = process.env.X_API_KEY;
		if (ipfsXApiKey) {
			downloadRequestHeaders["X-API-KEY"] = ipfsXApiKey;
		}
		const ipfsClientId = process.env.CLIENT_ID;
		if (ipfsClientId) {
			downloadRequestHeaders["CLIENT-ID"] = ipfsClientId;
		}

		const response = await requestsSession.get(url, {
			headers: downloadRequestHeaders,
			stream: true,
			timeout: 3000, // Convert timeout to milliseconds
		});

		if (!isRangeRequest) {
			let filename = url.split("/").slice(-1)[0];

			const contentDispositionHeader = response.headers.get(
				"content-disposition"
			);
			if (contentDispositionHeader) {
				const [_, contentDispositionParams] = parseHeader(
					contentDispositionHeader
				);
				const contentFilename = contentDispositionParams.get("filename");
				if (contentFilename) {
					filename = contentFilename;
				}
			}

			const contentTypeHeader = response.headers.get("content-type");
			if (contentTypeHeader) {
				contentType = contentTypeHeader;
			}

			const [fileExt, mimeType] = getContentTypeAndExtension(
				filename,
				contentType
			);

			if (mimeType) {
				downloadResponseHeaders["Content-Type"] = mimeType;
			}

			downloadResponseHeaders["Content-Disposition"] =
				`attachment;filename="${filename}"`;
			downloadResponseHeaders["Access-Control-Expose-Headers"] =
				"Content-Disposition";
		}

		const generate = function* (
			_response: Readable
		): Generator<Uint8Array | undefined> {
			for (const chunk of _response.readable) {
				if (chunk) {
					yield chunk;
				}
			}
		};

		return new Response(
			generate(response),
			response.status,
			downloadResponseHeaders
		);
	} catch (error) {
		console.error(`Error preparing file download response: ${error}`);
		throw error; // Re-throw to indicate the download failed
	}
}

function getContentTypeAndExtension(
	filename: string,
	contentType?: string
): [string | undefined, string | undefined] {
	const fileExt = path.extname(filename).toLowerCase();
	if (fileExt && !contentType) {
		return [mimetypes.guessType(filename)[0], fileExt];
	} else if (!fileExt && contentType) {
		const extension = mimetypes.guessExtension(contentType);
		return [contentType, extension];
	}
	return [contentType, undefined];
}
