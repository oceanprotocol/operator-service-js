import express from 'express'
import { LOG_LEVELS_STR } from '../utils/logger'

export const resultsRoutes = express.Router()

resultsRoutes.get('/getResult', async (req, res) => {
  try {
    console.log(
      `GET results request received with query: ${JSON.stringify(req.query)}`,
      true
    )
    const index = req.query.index
    const jobId = req.query.jobId as string
    const providerSignature = req.query.providerSignature as string
    const owner = req.query.owner as string

    if (!index || !jobId || !providerSignature || !owner) {
      console.log(
        `Missing parameters in GET results request with query: ${JSON.stringify(req.query)}`,
        true
      )
      return res.status(400).send('Missing parameters')
    }
    // get_requests_session
    // process_provider_signature_validation
    // get_sql_job_urls
    // get_job_by_provider_and_owner
  } catch (error) {
    console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})
