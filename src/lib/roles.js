export const ROLE_LABELS = {
  SUPER_ADMIN: 'DG / Super Admin',
  ACCOUNTANT: 'Responsable des paiements',
  MODERATOR: 'Modérateur',
  CUSTOMER_SERVICE: 'Service client',
  OPERATIONS_MANAGER: 'Responsable commandes et livreurs',
  COURIER: 'Livreur',
}

export const STAFF_ROLES = Object.keys(ROLE_LABELS)

export const MARKETPLACE_ROLES = [
  ['client', 'Client'],
  ['courier', 'Livreur'],
]
