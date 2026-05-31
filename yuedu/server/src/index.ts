import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import Router from 'koa-router'
import { proxyHandler } from './proxy.js'

const app = new Koa()
const router = new Router()

router.post('/api/proxy', proxyHandler)

app.use(cors({ origin: '*' }))
app.use(bodyParser())
app.use(router.routes())
app.use(router.allowedMethods())

app.listen(3001, () => {
  console.log('BFF proxy running on http://localhost:3001')
})
