import express from 'express'
import { LOG_LEVELS_STR } from '../utils/logger'
import { getSqlEnvironments } from '../database'

export const environmentRoutes = express.Router()

environmentRoutes.get('/environments', async (req, res) => {
  try {
    const chainId = req.query.chainId as string

    if (!chainId) {
      console.log(LOG_LEVELS_STR.LEVEL_ERROR, `No chainId provided`)
      return res.status(400).json({ error: 'No chainId provided' })
    }

    const apiResponse = await getSqlEnvironments(chainId)

    if (!apiResponse) {
      return res.status(400).json({ error: 'No environments found' })
    }

    return res.status(200).json(apiResponse)
  } catch (error) {
    console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})
