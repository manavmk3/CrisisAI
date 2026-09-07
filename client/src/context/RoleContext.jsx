import React, { createContext, useContext, useState } from 'react';

export const ROLES = {
  CITIZEN: 'citizen',
  RESPONDER: 'responder',
  AUTHORITY: 'authority',
  ADMIN: 'admin',
};

export const ROLE_CONFIG = {
  [ROLES.CITIZEN]: {
    name: 'Citizen',
    description: 'Report emergencies, track incident status & view nearby shelters',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  [ROLES.RESPONDER]: {
    name: 'Volunteer / Responder',
    description: 'View field assignments, update status & broadcast location',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
  [ROLES.AUTHORITY]: {
    name: 'Incident Authority',
    description: 'Triage AI-extracted incidents, allocate resources & verify reports',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  [ROLES.ADMIN]: {
    name: 'System Admin',
    description: 'Manage users, agencies, AI system parameters & audit logs',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
};

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [currentRole, setCurrentRole] = useState(ROLES.AUTHORITY);

  return (
    <RoleContext.Provider value={{ currentRole, setCurrentRole, ROLES, ROLE_CONFIG }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
