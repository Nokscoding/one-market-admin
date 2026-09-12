export const cdf = value => `${new Intl.NumberFormat('fr-CD').format(Number(value || 0))} FC`
export const usd = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
export const dateTime = value => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'

export const ORDER_LABELS = {
  pending_confirmation: 'À confirmer', pending: 'À confirmer', confirmed: 'Confirmée', preparing: 'En préparation',
  ready: 'Prête', out_for_delivery: 'En livraison', delivered: 'Livrée', cancelled: 'Annulée', failed: 'Échouée', refused: 'Refusée',
}

export const SELLER_LABELS = {
  draft: 'Brouillon', pending: 'En attente', under_review: 'En examen', approved: 'Approuvé', rejected: 'Refusé',
  needs_information: 'Infos requises', suspended: 'Suspendu',
}

export const TICKET_LABELS = {
  open: 'Ouvert', in_progress: 'En cours', waiting_customer: 'Attente client', escalated: 'Escaladé', resolved: 'Résolu', closed: 'Fermé',
}

export function tone(value) {
  if (['approved','active','delivered','cash_received','resolved'].includes(value)) return 'ok'
  if (['rejected','suspended','disabled','failed','cancelled','refused','closed'].includes(value)) return 'bad'
  if (['pending','pending_confirmation','under_review','in_progress','ready','preparing','out_for_delivery','needs_information','escalated'].includes(value)) return 'warn'
  return 'neutral'
}
