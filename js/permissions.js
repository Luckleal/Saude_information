const ROLE_ALIASES = {
  administrador: 'admin',
  admin: 'admin',

  medico: 'medico',
  médico: 'medico',

  enfermagem: 'enfermagem',
  enfermeiro: 'enfermagem',
  enfermeira: 'enfermagem'
};

const PERMISSIONS = {
  admin: [
    'manageUsers',
    'editUsers',
    'deleteUsers',
    'viewDashboard',
    'viewPatients',
    'editBeds',
    'releaseBed',
    'exportRecord',
    'useCalculator',
    'updateVitals'
  ],

  medico: [
    'viewDashboard',
    'viewPatients',
    'editBeds',
    'exportRecord',
    'useCalculator'
  ],

  enfermagem: [
    'viewDashboard',
    'viewPatients',
    'updateVitals',
    'editBeds'
  ]
};

export function normalizeRole(role) {
  if (!role) return '';
  return ROLE_ALIASES[String(role).trim().toLowerCase()] || String(role).trim().toLowerCase();
}

export function can(role, permission) {
  const normalizedRole = normalizeRole(role);
  return PERMISSIONS[normalizedRole]?.includes(permission) || false;
}

export function roleLabel(role) {
  const normalizedRole = normalizeRole(role);

  const labels = {
    admin: 'Administrador',
    medico: 'Médico',
    enfermagem: 'Enfermagem'
  };

  return labels[normalizedRole] || 'Sem perfil';
}

export function allowedPatientFields(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin') {
    return 'all';
  }

  if (normalizedRole === 'medico') {
    return 'medical';
  }

  if (normalizedRole === 'enfermagem') {
    return 'nursing';
  }

  return 'none';
}