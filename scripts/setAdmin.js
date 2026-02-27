import admin from 'firebase-admin'
import fs from 'fs'

const serviceAccount = JSON.parse(
  fs.readFileSync('./serviceAccount.json', 'utf8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

async function run() {
  const uid = 'RUkoQli9kFR0OZaRyH9qaLBTxUk1'

  await admin.auth().setCustomUserClaims(uid, {
    nivel: 4,   // 🔥 ESTO es lo que tu sistema usa
  })

  console.log('✅ NIVEL 4 asignado correctamente al UID:', uid)
  process.exit(0)
}

run().catch(err => {
  console.error('❌ Error asignando nivel:', err)
  process.exit(1)
})