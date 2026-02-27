const admin = require('firebase-admin')

let initialized = false

function getAdmin() {
  if (!initialized) {
    admin.initializeApp()
    initialized = true
  }
  return admin
}

module.exports = { getAdmin }