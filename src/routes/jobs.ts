import express from 'express'
import { LOG_LEVELS_STR } from '../utils/logger'
import { sanitizeResponseForProvider } from '../utils'
import { getSqlRunningJobs } from '../database'

export const jobsRoutes = express.Router()

jobsRoutes.get('/runningjobs', async (req, res) => {
  try {
    const sanitizedResponse = sanitizeResponseForProvider(await getSqlRunningJobs())
    return res.status(200).json(sanitizedResponse)
  } catch (error) {
    console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})
