import express, { Express } from 'express'
import { httpRoutes } from './routes/index.js'

const app: Express = express()
app.use(express.raw())
app.use('/api/v1/operator', httpRoutes)
app.listen(process.env.HTTP_PORT || 3000, () => {
  console.log(`HTTP port: ${process.env.HTTP_PORT}`, true)
})
