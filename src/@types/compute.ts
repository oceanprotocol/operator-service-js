export interface GetComputeJobStatusQuery {
  agreementId?: string
  jobId?: string
  owner?: string
  providerSignature?: string
  nonce?: string
  chainId?: string
}
export interface StopComputeJobBody {
  owner?: string
  providerSignature?: string
  nonce?: number
  agreementId?: string
  jobId?: string
  chainId?: string
}

export interface StartComputeJobBody {
  chainId: string
  workflow?: {
    stages: {
      index: number
      input: { id: string; url: string[] }[]
      compute: {}
      algorithm: {
        id: string
        url?: string
        rawcode?: string
        container?: { image: string; tag: string; entrypoint: string }
      }
      output: {
        nodeUri?: string
        brizoUri?: string
        brizoAddress?: string
        metadata?: { name: string }
        metadataUri?: string
        secretStoreUri?: string
        whitelist?: string[]
        owner?: string
        publishOutput?: boolean
        publishAlgorithmLog?: boolean
      }
    }[]
    chainId?: string
  }
  agreementId?: string
  owner?: string
  providerSignature?: string
  environment?: string
  nonce?: number
}
