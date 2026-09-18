function rawMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return String(error.message || error.details || error.hint || '')
}

export function logAdminError(context, error) {
  console.error(`[One Market Admin:${context}]`, error)
}

export function adminUserError(error, fallback = 'Une erreur est survenue. Réessayez.') {
  const raw = rawMessage(error)
  const message = raw.toLowerCase()
  const businessErrors = {
    delivery_not_completed: 'Confirmez la livraison avant d’enregistrer l’encaissement.',
    invalid_delivery_transition: 'Terminez l’étape précédente de la livraison avant de continuer.',
    order_status_final: 'Cette commande est terminée. Son statut ne peut plus être modifié.',
    seller_order_final: 'Cette commande vendeur est terminée.',
    payout_status_final: 'Ce règlement est terminé. Créez un nouveau règlement si nécessaire.',
    payout_not_ready: 'Ce règlement ne peut pas passer à cette étape.',
    paid_payout_immutable: 'Un règlement payé ne peut plus être modifié.',
    no_eligible_seller_orders: 'Aucune commande livrée et encaissée n’est disponible pour ce règlement.',
    payment_reference_required: 'Ajoutez la référence du paiement avant de confirmer.',
    payment_not_confirmed: 'Confirmez le paiement Mobile Money avant de poursuivre.',
    erp_super_admin_only: 'Cette action est réservée au Super Admin.',
    multi_currency_payout_not_supported: 'Sélectionnez une période contenant une seule devise.',
  }
  for (const [code, text] of Object.entries(businessErrors)) if (message.includes(code)) return text

  if (!message) return fallback
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('load failed')) {
    return 'Impossible de joindre le service. Vérifiez votre connexion puis réessayez.'
  }
  if (message.includes('jwt') || message.includes('session') || message.includes('token') && message.includes('expired')) {
    return 'Votre session a expiré. Reconnectez-vous puis réessayez.'
  }
  if (message.includes('erp_forbidden') || message.includes('permission denied') || message.includes('row-level security') || message.includes('42501')) {
    return 'Vous n’avez pas l’autorisation d’effectuer cette action.'
  }
  if (message.includes('order_not_found') || message.includes('seller_order_not_found')) {
    return 'Cette commande est introuvable ou n’est plus accessible.'
  }
  if (message.includes('reason_required') || message.includes('refusal_reason_required')) {
    return 'Indiquez une raison avant de continuer.'
  }
  if (message.includes('invalid_payment_status')) {
    return 'Ce statut de paiement n’est pas autorisé.'
  }
  if (message.includes('payment_status_final')) {
    return 'Ce paiement est déjà finalisé et ne peut plus être modifié.'
  }
  if (message.includes('invalid_payment_transition')) {
    return 'Cette transition de paiement n’est pas autorisée pour ce moyen de paiement.'
  }
  if (message.includes('payment_cancellation_too_late')) {
    return 'La commande a déjà été prise en charge et le paiement ne peut plus être annulé.'
  }
  if (message.includes('invalid_delivery_status')) {
    return 'Ce statut de livraison n’est pas autorisé.'
  }
  if (message.includes('invalid') || message.includes('uuid') || message.includes('pgrst')) {
    return 'Certaines informations ne sont pas valides. Vérifiez puis réessayez.'
  }
  if (message.includes('duplicate') || message.includes('23505')) {
    return 'Cette information existe déjà.'
  }

  return fallback
}
