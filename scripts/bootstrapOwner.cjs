// scripts/bootstrapOwner.cjs
const admin = require('firebase-admin')
const path = require('path')

const serviceAccount = require(
  path.resolve(__dirname, '../scripts/appbar.json')
)

async function bootstrap() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })

  const email = 'ivangabrielruiz1@gmail.com' // el tuyo real

  const user = await admin.auth().getUserByEmail(email)

  await admin.auth().setCustomUserClaims(user.uid, {
    admin: true,
    nivel: 4,
  })

  console.log('✅ OWNER BOOTSTRAPEADO')
  console.log('UID:', user.uid)
}

bootstrap().catch(err => {
  console.error('❌ ERROR BOOTSTRAP:', err)
})
