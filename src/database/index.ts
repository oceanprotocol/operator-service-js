import { Pool, PoolClient, Cursor, QueryResult, createPool } from 'pg'

// Replace with your actual connection details
const connectionString = `postgres://<span class="math-inline">\{process\.env\.POSTGRES\_<1\>USER\}\:</span>{process.env.POSTGRES_PASSWORD}@<span class="math-inline">\{process\.env\.POSTGRES\_HOST\}\:</span>{process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`

const pool = new Pool({ connectionString })

// Interface for job data
interface Job {
  agreementId: string
  jobId: string
  owner: string
  status: number
  statusText: string
  dateCreated: number
  dateFinished?: number
  configlogURL?: string
  publishlogURL?: string
  algologURL?: string
  outputsURL?: string
  ddo?: string
  stopreq: boolean
  removed: boolean
  workflow: any
  algoDID?: string
  inputDID: string[]
  results?: any
}

// Interface for environment data
interface Environment {
  id: string
  namespace: string
  status: any
  lastSeen: string
}

async function getConnection(): Promise<PoolClient | undefined> {
  try {
    const client = await pool.connect()
    return client
  } catch (error) {
    console.error('Error connecting to database:', error)
    return undefined
  }
}

async function executeQuery(
  query: string,
  params: any | any[],
  msg: string,
  getRows = false
): Promise<QueryResult | undefined> {
  const client = await getConnection()
  if (!client) return undefined

  try {
    const result = await client.query(query, params)
    if (getRows) {
      return result.rows
    } else {
      await client.query('COMMIT')
      return result
    }
  } catch (error) {
    console.error(`Error executing query "${msg}":`, error)
    return undefined
  } finally {
    if (client) {
      client.release()
    }
  }
}

export async function getSqlStatus(
  agreementId?: string,
  jobId?: string,
  owner?: string,
  chainId?: string
): Promise<Job[] | undefined> {
  if (!agreementId && !jobId && !owner) {
    console.error('At least one of agreementId, jobId, or owner must be provided.')
    return undefined
  }

  let query = `
    SELECT agreementId, workflowId, owner, status, statusText,
           extract(epoch from dateCreated) as dateCreated,
           extract(epoch from dateFinished) as dateFinished,
           configlogURL, publishlogURL, algologURL, outputsURL, ddo, stopreq, removed, workflow
    FROM jobs
    WHERE 1=1
  `

  const params: any[] = []

  if (agreementId) {
    query += ' AND agreementId=$1'
    params.push(agreementId)
  }

  if (jobId) {
    query += ' AND workflowId=$2'
    params.push(jobId)
  }

  if (owner) {
    query += ' AND owner=$3'
    params.push(owner)
  }

  const result = await executeQuery(query, params, 'get_sql_status', true)
  if (!result) return undefined

  const jobs: Job[] = []
  for (const row of result) {
    const tempJob: Job = {
      agreementId: row[0],
      jobId: row[1],
      owner: row[2],
      status: row[3],
      statusText: row[4],
      dateCreated: row[5],
      stopreq: row[12],
      removed: row[13],
      workflow: undefined,
      inputDID: []
    }

    if (row[6]) {
      tempJob.dateFinished = row[6]
    }

    if (row[7]) {
      tempJob.configlogURL = row[7]
    }

    if (row[8]) {
      tempJob.publishlogURL = row[8]
    }

    if (row[9]) {
      tempJob.algologURL = row[9]
    }

    if (row[10]) {
      tempJob.outputsURL = row[10]
    }

    if (row[11]) {
      tempJob.ddo = row[11]
    }

    if (row[14]) {
      tempJob.workflow = JSON.parse(row[14])
    }

    jobs.push(tempJob)
  }

  return jobs
}

export async function getSqlJobUrls(
  jobId: string | undefined
): Promise<[any, string] | undefined> {
  if (!jobId) {
    return undefined
  }

  const params = { jobId: jobId }
  const query = `SELECT owner, outputsURL FROM jobs WHERE workflowId=$1`

  try {
    const result = await executeQuery(query, params, 'get_sql_job_urls', true)
    if (!result || result.length < 1) {
      return undefined
    }

    const row = result[0]
    const owner = row[0]
    try {
      const outputs = JSON.parse(row[1])
      return [outputs, owner]
    } catch (error) {
      console.error('Error parsing outputs:', error)
      return undefined
    }
  } catch (error) {
    console.error('Error getting job URLs:', error)
    return undefined
  }
}

export async function getSqlJobs(
  agreementId?: string,
  jobId?: string,
  owner?: string
): Promise<string[]> {
  const params: { [key: string]: any } = {}
  let query = 'SELECT workflowId FROM jobs WHERE 1=1'

  if (agreementId) {
    query += ' AND agreementId=$1'
    params['agreementId'] = agreementId
  }

  if (jobId) {
    query += ' AND workflowId=$2'
    params['jobId'] = jobId
  }

  if (owner) {
    query += ' AND owner=$3'
    params['owner'] = owner
  }

  try {
    const result = await executeQuery(query, params, 'get_sql_jobs', true)
    if (!result) {
      return []
    }

    const jobIds: string[] = []
    for (const row of result) {
      jobIds.push(row[0])
    }
    return jobIds
  } catch (error) {
    console.error('Error getting job IDs:', error)
    return []
  }
}

export async function getSqlRunningJobs(): Promise<Job[]> {
  const params: { [key: string]: any } = {}
  const query = `
      SELECT agreementId, workflowId, owner, status, statusText,
             extract(epoch from dateCreated) as dateCreated,
             namespace, workflow
      FROM jobs
      WHERE dateFinished IS NULL
    `

  try {
    const result = await executeQuery(query, params, 'get_sql_running_jobs', true)
    if (!result) {
      return []
    }

    const jobs: Job[] = []
    for (const row of result) {
      const tempJob: Job = {
        agreementId: row[0],
        jobId: row[1],
        owner: row[2],
        status: row[3],
        statusText: row[4],
        dateCreated: row[5],
        namespace: row[6]
      }

      try {
        const workflowDict = JSON.parse(row[7])
        if ('chainId' in workflowDict) {
          tempJob.chainId = workflowDict['chainId']
        }
        const stage = workflowDict['spec']['metadata']['stages'][0]
        if ('id' in stage['algorithm']) {
          tempJob.algoDID = stage['algorithm']['id']
        } else {
          tempJob.algoDID = 'raw'
        }
        tempJob.inputDID = []
        for (const input of stage['input']) {
          if ('id' in input) {
            tempJob.inputDID.push(input['id'])
          }
        }
      } catch (error) {
        console.error('Error processing workflow data for job:', error)
      }

      jobs.push(tempJob)
    }

    return jobs
  } catch (error) {
    console.error('Error getting running jobs:', error)
    return []
  }
}

export async function getNonce(providerAddress: string): Promise<number | undefined> {
  const params = { provider: providerAddress }
  const query = `SELECT nonce FROM nonces WHERE provider = $1`

  try {
    const result = await executeQuery(query, params, 'get_nonce', true)
    if (!result) {
      console.info('Nonce is null')
      return undefined
    }

    const values: number[] = []
    for (const row of result) {
      if (typeof row[0] === 'string' && row[0].length === 19) {
        values.push(parseInt(row[0], 10))
      } else if (typeof row[0] === 'number') {
        values.push(row[0])
      } else {
        console.warn('Unexpected format for nonce value:', row[0])
      }
    }

    if (!values.length) {
      console.info('No valid nonces found')
      return undefined
    }

    const maxNonce = Math.max(...values)
    console.info(`Nonce found: ${maxNonce}`)
    return maxNonce
  } catch (error) {
    console.error('Error getting nonce:', error)
    return undefined
  }
}

export async function updateNonceForProvider(
  nonce: string,
  providerAddress: string
): Promise<void> {
  const params = { provider: providerAddress }

  // Check if provider exists
  const existQuery = `SELECT provider FROM nonces WHERE provider = $1`
  try {
    const existResult = await executeQuery(existQuery, params, 'check_provider_exists')
    if (!existResult) {
      // Insert new nonce if provider doesn't exist
      const insertQuery = `INSERT INTO nonces (provider, nonce) VALUES ($1, $2)`
      const recordToInsert = [providerAddress, nonce]
      try {
        await executeQuery(insertQuery, recordToInsert, 'create_nonce')
        console.debug(`create_nonce: ${providerAddress}, new nonce ${nonce}`)
        return
      } catch (error) {
        console.error('Error creating nonce row:', error)
        return
      }
    }
  } catch (error) {
    console.error('Error checking for existing provider:', error)
    return
  }

  // Update existing nonce
  const updateQuery = `UPDATE nonces SET nonce=$1 WHERE provider=$2`
  const recordToInsert = [nonce, providerAddress]

  try {
    await executeQuery(updateQuery, recordToInsert, 'update_nonce')
    console.info(`Updated nonce for provider: ${providerAddress}`)
  } catch (error) {
    console.error('Error updating nonce:', error)
  }
}

export async function getSqlEnvironments(chainId: string): Promise<Environment[]> {
  const params: { [key: string]: any } = {}
  const query = `
    SELECT namespace, status, extract(epoch from lastping) as lastping
    FROM envs
  `

  try {
    const result = await executeQuery(query, params, 'get_sql_environments', true)
    if (!result) {
      return []
    }

    const environments: Environment[] = []
    for (const row of result) {
      try {
        const statusData = JSON.parse(row[1])

        if ('allowedChainId' in statusData) {
          const allowedChainIds: string[] | undefined = statusData['allowedChainId']
          if (Array.isArray(allowedChainIds) && allowedChainIds.length > 0) {
            if (!allowedChainIds.includes(chainId)) {
              continue
            }
          }
        }

        const environment: Environment = {
          id: row[0],
          namespace: row[0],
          status: statusData,
          lastSeen: row[2].toString()
        }

        environments.push(environment)
      } catch (error) {
        console.error('Error processing environment data for row:', error)
      }
    }

    return environments
  } catch (error) {
    console.error('Error getting environments:', error)
    return []
  }
}

export async function checkEnvironmentExists(
  environment: string,
  chainId: string
): Promise<boolean> {
  const params = { env: environment }
  const query = `
    SELECT namespace, status, extract(epoch from lastping) as lastping
    FROM envs
    WHERE namespace = $1
  `

  try {
    const result = await executeQuery(query, params, 'check_environment_exists', true)
    if (!result) {
      return false
    }

    const statusData = JSON.parse(result[0][1])

    if ('allowedChainId' in statusData) {
      const allowedChainIds: string[] | undefined = statusData['allowedChainId']
      if (Array.isArray(allowedChainIds) && allowedChainIds.length > 0) {
        if (!allowedChainIds.includes(chainId)) {
          return false
        }
      }
    }

    return true
  } catch (error) {
    console.error('Error checking environment:', error)
    return false
  }
}

export async function getJobByProviderAndOwner(
  owner: string,
  provider: string
): Promise<Job[]> {
  const params = { owner, provider }
  const query = `
    SELECT agreementId, workflowId, owner, status, statusText,
           extract(epoch from dateCreated) as dateCreated,
           namespace
    FROM jobs
    WHERE provider = $1 AND owner = $2
  `

  try {
    const result = await executeQuery(
      query,
      params,
      'get_job_by_provider_and_owner',
      true
    )
    if (!result) {
      return []
    }

    const jobs: Job[] = []
    for (const row of result) {
      jobs.push({
        agreementId: row[0],
        jobId: row[1],
        owner: row[2],
        status: row[3],
        statusText: row[4],
        dateCreated: row[5],
        namespace: row[6]
      })
    }

    return jobs
  } catch (error) {
    console.error('Error getting job by provider and owner:', error)
    return []
  }
}

export async function createSqlJob(
  agreementId: string,
  jobId: string,
  owner: string,
  body: unknown, // Use a generic type for unknown object
  namespace: string,
  providerAddress: string
): Promise<void> {
  const insertQuery = `
    INSERT INTO jobs
      (agreementId, workflowId, owner, status, statusText, workflow, namespace, provider)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
  `

  const recordToInsert = [
    agreementId,
    jobId,
    owner,
    1, // Assuming status is 1 for "Warming up"
    'Warming up',
    JSON.stringify(body),
    namespace,
    providerAddress
  ]

  try {
    await executeQuery(insertQuery, recordToInsert, 'create_sql_job')
    console.info(`Job created successfully: ${jobId}`)
  } catch (error) {
    console.error('Error creating job:', error)
  }
}

export async function stopSqlJob(executionId: string): Promise<void> {
  const updateQuery = `
    UPDATE jobs
    SET stopreq=1
    WHERE workflowId=$1
  `
  const recordToInsert = [executionId]
  try {
    await executeQuery(updateQuery, recordToInsert, 'stop_sql_job')
    console.info(`Job stop request sent for: ${executionId}`)
  } catch (error) {
    console.error('Error stopping job:', error)
  }
}

export async function removeSqlJob(executionId: string): Promise<void> {
  const updateQuery = `
    UPDATE jobs
    SET removed=1
    WHERE workflowId=$1
  `
  const recordToInsert = [executionId]

  try {
    await executeQuery(updateQuery, recordToInsert, 'remove_sql_job')
    console.info(`Job removed successfully: ${executionId}`)
  } catch (error) {
    console.error('Error removing job:', error)
  }
}

export async function getPgConnectionAndCursor(): Promise<[PoolClient, Cursor] | null> {
  try {
    const pool = await createPool({
      user: process.env.POSTGRES_USER, // Use process.env directly
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT) || 5432, // Parse port to a number
      database: process.env.POSTGRES_DB
    })

    const client = await pool.connect()
    await client.query("SET CLIENT_ENCODING TO 'LATIN9'") // Use query method
    const cursor = await client.query('SELECT 1') // Establish connection

    return [client, cursor[0]]
  } catch (error) {
    console.error('Error getting PG connection and cursor:', error)
    return null
  }
}
