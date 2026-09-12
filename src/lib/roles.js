export const ROLE_LABELS = {
  SUPER_ADMIN: 'DG / Super Admin',
  ACCOUNTANT: 'Comptable',
  MODERATOR: 'Modérateur',
  CUSTOMER_SERVICE: 'Service client',
  OPERATIONS_MANAGER: 'Gestionnaire opérations',
}

export const STAFF_ROLES = Object.keys(ROLE_LABELS)

export const MARKETPLACE_ROLES = [
  ['client', 'Client'],
  ['seller', 'Vendeur'],
  ['courier', 'Livreur'],
]
