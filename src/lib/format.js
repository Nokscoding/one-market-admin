export const cdf = value => `${new Intl.NumberFormat('fr-CD').format(Number(value || 0))} FC`
export const usd = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
export const dateTime = value => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'

export const ORDER_LABELS = {
  pending_confirmation: 'À confirmer',
  pending: 'À confirmer',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  ready: 'Prête',
  picked_up: 'Récupérée par le livreur',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  partially_completed: 'Partiellement terminée',
  problem: 'Problème signalé',
  cancelled: 'Annulée',
  failed: 'Échouée',
  refused: 'Refusée',
}

export const PAYMENT_LABELS = {
  pending_on_delivery: 'À payer au livreur',
  awaiting_mobile_money: 'À finaliser',
  payment_submitted: 'Paiement envoyé, vérification en cours',
  paid: 'Paiement confirmé',
  cash_received: 'Paiement encaissé',
  cancelled: 'Paiement annulé',
  failed: 'Paiement échoué',
}

export const LOGISTICS_LABELS = {
  pending: 'En attente',
  preparing: 'En préparation',
  ready: 'Prête',
  picked_up: 'Récupérée par le livreur',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  failed: 'Échec de livraison',
  problem: 'Problème signalé',
  refused: 'Refusée',
  cancelled: 'Annulée',
}

export const SELLER_LABELS = {
  draft: 'Brouillon', pending: 'En attente', under_review: 'En examen', approved: 'Approuvé', rejected: 'Refusé',
  needs_information: 'Infos requises', suspended: 'Suspendu',
}

export const TICKET_LABELS = {
  open: 'Ouvert', in_progress: 'En cours', waiting_customer: 'Attente client', escalated: 'Escaladé', resolved: 'Résolu', closed: 'Fermé',
}

export function tone(value) {
  if (['approved','active','delivered','cash_received','paid','resolved'].includes(value)) return 'ok'
  if (['rejected','suspended','disabled','failed','cancelled','refused','closed','refunded'].includes(value)) return 'bad'
  if (['pending','pending_confirmation','under_review','in_progress','ready','preparing','picked_up','out_for_delivery','problem','partially_completed','needs_information','escalated','payment_submitted','pending_on_delivery','scheduled','awaiting_mobile_money'].includes(value)) return 'warn'
  return 'neutral'
}
