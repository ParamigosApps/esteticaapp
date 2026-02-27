exports.descontarCuposAdmin = onCall(async request => {
  const { auth, data } = request

  // 🔒 Solo admin (claim)
  if (!auth?.token?.admin) {
    throw new HttpsError('permission-denied', 'Solo admin')
  }

  // data debe incluir: eventoId LoteId, cantidad, usuarioId, compraId
  return await descontarCuposArray(data)
})
