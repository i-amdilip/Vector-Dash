import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  SystemUser,
  RescueTeam,
  UserRole,
  ROLE_HIERARCHY_LEVEL,
  ROLE_DEFINITIONS,
  canManageRole as checkCanManageRole,
  canManageUser as checkCanManageUser,
  canAccessState as checkCanAccessState,
  canAccessDistrict as checkCanAccessDistrict,
  getCreatableRoles as checkGetCreatableRoles,
} from '../types';
import {
  INITIAL_SYSTEM_USERS,
  INITIAL_RESCUE_TEAMS,
  ROLE_SWITCHER_PRESETS,
  RolePreset,
} from '../data/mockUsersAndRoles';

interface AuthContextType {
  currentUser: SystemUser;
  users: SystemUser[];
  rescueTeams: RescueTeam[];
  presets: RolePreset[];
  activePresetId: string;
  // Role Switchers
  switchRolePreset: (presetId: string) => void;
  switchUser: (userId: string) => void;
  // RBAC checks for current user
  canManageRole: (targetRole: UserRole) => boolean;
  canManageUser: (targetUser: SystemUser) => boolean;
  canAccessState: (state: string) => boolean;
  canAccessDistrict: (state: string, district?: string) => boolean;
  canCreateRole: (role: UserRole) => boolean;
  getCreatableRoles: () => UserRole[];
  canDispatchRescueTeams: boolean;
  canAssignIncidentOfficers: boolean;
  canBroadcastEmergency: boolean;
  canManagePersonnel: boolean;
  isSuperAdmin: boolean;
  isStateAdmin: boolean;
  isDistrictAdmin: boolean;
  isFieldOfficer: boolean;
  isRescueTeamMember: boolean;
  // Personnel CRUD
  createUser: (userData: Omit<SystemUser, 'id' | 'createdAt'>) => {
    success: boolean;
    message: string;
    user?: SystemUser;
  };
  updateUser: (
    userId: string,
    updates: Partial<SystemUser>
  ) => { success: boolean; message: string };
  deleteUser: (userId: string) => { success: boolean; message: string };
  // Rescue Teams CRUD
  createRescueTeam: (
    teamData: Omit<RescueTeam, 'id' | 'lastStatusUpdate'>
  ) => { success: boolean; message: string; team?: RescueTeam };
  updateRescueTeam: (
    teamId: string,
    updates: Partial<RescueTeam>
  ) => { success: boolean; message: string };
  deleteRescueTeam: (teamId: string) => { success: boolean; message: string };
  addMemberToTeam: (
    teamId: string,
    userId: string
  ) => { success: boolean; message: string };
  removeMemberFromTeam: (
    teamId: string,
    userId: string
  ) => { success: boolean; message: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<SystemUser[]>(INITIAL_SYSTEM_USERS);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>(INITIAL_RESCUE_TEAMS);
  const [activePresetId, setActivePresetId] = useState<string>('preset-super-admin');

  // Find the active preset
  const activePreset = useMemo(() => {
    return (
      ROLE_SWITCHER_PRESETS.find((p) => p.id === activePresetId) ||
      ROLE_SWITCHER_PRESETS[0]
    );
  }, [activePresetId]);

  // Current user derived from the users array so live edits reflect immediately
  const currentUser = useMemo(() => {
    const matched = users.find((u) => u.id === activePreset.user.id);
    return matched || activePreset.user;
  }, [users, activePreset]);

  // Switch role preset handler
  const switchRolePreset = (presetId: string) => {
    const target = ROLE_SWITCHER_PRESETS.find((p) => p.id === presetId);
    if (target) {
      setActivePresetId(target.id);
    }
  };

  // Switch to specific user in directory
  const switchUser = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) {
      // Find preset with matching user id or matching role
      const matchingPreset = ROLE_SWITCHER_PRESETS.find((p) => p.user.id === found.id);
      if (matchingPreset) {
        setActivePresetId(matchingPreset.id);
      } else {
        // Fallback: match by role
        const rolePreset = ROLE_SWITCHER_PRESETS.find((p) => p.role === found.role);
        if (rolePreset) setActivePresetId(rolePreset.id);
      }
    }
  };

  // RBAC checks evaluated against currentUser
  const canManageRole = (targetRole: UserRole) => {
    return checkCanManageRole(currentUser.role, targetRole);
  };

  const canManageUser = (targetUser: SystemUser) => {
    return checkCanManageUser(currentUser, targetUser);
  };

  const canAccessState = (state: string) => {
    return checkCanAccessState(currentUser, state);
  };

  const canAccessDistrict = (state: string, district?: string) => {
    return checkCanAccessDistrict(currentUser, state, district);
  };

  const canCreateRole = (role: UserRole) => {
    return ROLE_HIERARCHY_LEVEL[currentUser.role] > ROLE_HIERARCHY_LEVEL[role];
  };

  const getCreatableRoles = () => {
    return checkGetCreatableRoles(currentUser.role);
  };

  const isSuperAdmin = currentUser.role === 'super_admin';
  const isStateAdmin = currentUser.role === 'state_admin';
  const isDistrictAdmin = currentUser.role === 'district_admin';
  const isFieldOfficer = currentUser.role === 'field_officer';
  const isRescueTeamMember = currentUser.role === 'rescue_team_member';

  // Specific operational privileges
  const canDispatchRescueTeams =
    isSuperAdmin || isStateAdmin || isDistrictAdmin;
  const canAssignIncidentOfficers =
    isSuperAdmin || isStateAdmin || isDistrictAdmin;
  const canBroadcastEmergency =
    isSuperAdmin || isStateAdmin || isDistrictAdmin;
  const canManagePersonnel =
    isSuperAdmin || isStateAdmin || isDistrictAdmin;

  // Create user handler with strict hierarchy and geographic validation
  const createUser = (userData: Omit<SystemUser, 'id' | 'createdAt'>) => {
    // 1. Role hierarchy check
    if (!canCreateRole(userData.role)) {
      return {
        success: false,
        message: `Hierarchy Violation: As a ${ROLE_DEFINITIONS[currentUser.role].label}, you cannot create a user with role ${ROLE_DEFINITIONS[userData.role].label}. You can only create roles below your level.`,
      };
    }

    // 2. Geographic restriction check
    if (isStateAdmin) {
      if (userData.state.toLowerCase() !== currentUser.state.toLowerCase()) {
        return {
          success: false,
          message: `Geographic Violation: State Admin for ${currentUser.state} cannot create users in ${userData.state}. You can only create personnel within ${currentUser.state}.`,
        };
      }
    }

    if (isDistrictAdmin) {
      if (
        userData.state.toLowerCase() !== currentUser.state.toLowerCase() ||
        userData.district.toLowerCase() !== currentUser.district.toLowerCase()
      ) {
        return {
          success: false,
          message: `Geographic Violation: District Admin for ${currentUser.district} (${currentUser.state}) cannot create users in ${userData.district}, ${userData.state}. You can only create personnel within your assigned district.`,
        };
      }
    }

    // 3. Generate new user
    const newUser: SystemUser = {
      ...userData,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) => [newUser, ...prev]);
    return {
      success: true,
      message: `Successfully created ${ROLE_DEFINITIONS[newUser.role].label} "${newUser.name}" (${newUser.badgeId}).`,
      user: newUser,
    };
  };

  // Update user handler
  const updateUser = (userId: string, updates: Partial<SystemUser>) => {
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, message: 'User not found.' };
    }

    // Must have management permissions over target
    if (!canManageUser(target)) {
      return {
        success: false,
        message: `Permission Denied: You do not have permission to edit ${target.name} (${ROLE_DEFINITIONS[target.role].label}). You can only manage users strictly below your level within your jurisdiction.`,
      };
    }

    // If changing role, new role must also be below current user
    if (updates.role && !canCreateRole(updates.role)) {
      return {
        success: false,
        message: `Hierarchy Violation: Cannot promote user to ${ROLE_DEFINITIONS[updates.role].label}, which is at or above your level.`,
      };
    }

    // If changing geographic location, must stay within actor's scope
    if (isStateAdmin && updates.state && updates.state.toLowerCase() !== currentUser.state.toLowerCase()) {
      return {
        success: false,
        message: `Geographic Violation: State Admin cannot move users outside ${currentUser.state}.`,
      };
    }

    if (isDistrictAdmin) {
      if (
        (updates.state && updates.state.toLowerCase() !== currentUser.state.toLowerCase()) ||
        (updates.district && updates.district.toLowerCase() !== currentUser.district.toLowerCase())
      ) {
        return {
          success: false,
          message: `Geographic Violation: District Admin cannot assign users outside ${currentUser.district}, ${currentUser.state}.`,
        };
      }
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...updates } : u))
    );

    return {
      success: true,
      message: `Updated user record for ${target.name}.`,
    };
  };

  // Delete user handler
  const deleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, message: 'User not found.' };
    }

    if (!canManageUser(target)) {
      return {
        success: false,
        message: `Permission Denied: You do not have authority to remove ${target.name} (${ROLE_DEFINITIONS[target.role].label}).`,
      };
    }

    setUsers((prev) => prev.filter((u) => u.id !== userId));
    return {
      success: true,
      message: `Successfully removed user ${target.name} from directory.`,
    };
  };

  // Create rescue team handler (District Admin, State Admin, Super Admin)
  const createRescueTeam = (teamData: Omit<RescueTeam, 'id' | 'lastStatusUpdate'>) => {
    if (!canDispatchRescueTeams) {
      return {
        success: false,
        message: 'Permission Denied: Only District Admins and higher can create Rescue Teams.',
      };
    }

    // Geographic verification
    if (isStateAdmin && teamData.state.toLowerCase() !== currentUser.state.toLowerCase()) {
      return {
        success: false,
        message: `Geographic Violation: State Admin for ${currentUser.state} cannot create rescue teams in ${teamData.state}.`,
      };
    }

    if (isDistrictAdmin) {
      if (
        teamData.state.toLowerCase() !== currentUser.state.toLowerCase() ||
        teamData.district.toLowerCase() !== currentUser.district.toLowerCase()
      ) {
        return {
          success: false,
          message: `Geographic Violation: District Admin for ${currentUser.district} cannot create rescue teams in ${teamData.district}, ${teamData.state}.`,
        };
      }
    }

    const newTeam: RescueTeam = {
      ...teamData,
      id: `team-${Date.now()}`,
      lastStatusUpdate: 'Just now',
    };

    setRescueTeams((prev) => [newTeam, ...prev]);
    return {
      success: true,
      message: `Rescue team "${newTeam.name}" created successfully.`,
      team: newTeam,
    };
  };

  // Update rescue team handler
  const updateRescueTeam = (teamId: string, updates: Partial<RescueTeam>) => {
    const target = rescueTeams.find((t) => t.id === teamId);
    if (!target) {
      return { success: false, message: 'Rescue team not found.' };
    }

    // Geographic check
    if (!canAccessDistrict(target.state, target.district)) {
      return {
        success: false,
        message: `Geographic Violation: You do not have jurisdiction over rescue teams in ${target.district}, ${target.state}.`,
      };
    }

    setRescueTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, ...updates, lastStatusUpdate: 'Just now' } : t
      )
    );

    return {
      success: true,
      message: `Updated rescue team "${target.name}".`,
    };
  };

  // Delete rescue team handler
  const deleteRescueTeam = (teamId: string) => {
    const target = rescueTeams.find((t) => t.id === teamId);
    if (!target) {
      return { success: false, message: 'Rescue team not found.' };
    }

    if (!canAccessDistrict(target.state, target.district)) {
      return {
        success: false,
        message: `Geographic Violation: You do not have jurisdiction to disband rescue teams in ${target.district}, ${target.state}.`,
      };
    }

    setRescueTeams((prev) => prev.filter((t) => t.id !== teamId));
    return {
      success: true,
      message: `Disbanded rescue team "${target.name}".`,
    };
  };

  // Add member to rescue team
  const addMemberToTeam = (teamId: string, userId: string) => {
    const team = rescueTeams.find((t) => t.id === teamId);
    const user = users.find((u) => u.id === userId);

    if (!team || !user) {
      return { success: false, message: 'Team or User not found.' };
    }

    if (!canAccessDistrict(team.state, team.district)) {
      return {
        success: false,
        message: `Geographic Violation: You do not have jurisdiction over ${team.district}.`,
      };
    }

    if (team.memberIds.includes(userId)) {
      return { success: false, message: 'User is already a member of this team.' };
    }

    setRescueTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              memberIds: [...t.memberIds, userId],
              memberCount: t.memberCount + 1,
              lastStatusUpdate: 'Just now',
            }
          : t
      )
    );

    // Update user record with assigned team
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, assignedTeamId: team.id, assignedTeamName: team.name }
          : u
      )
    );

    return {
      success: true,
      message: `Assigned ${user.name} to ${team.name}.`,
    };
  };

  // Remove member from rescue team
  const removeMemberFromTeam = (teamId: string, userId: string) => {
    const team = rescueTeams.find((t) => t.id === teamId);
    const user = users.find((u) => u.id === userId);

    if (!team) {
      return { success: false, message: 'Team not found.' };
    }

    if (!canAccessDistrict(team.state, team.district)) {
      return {
        success: false,
        message: `Geographic Violation: You do not have jurisdiction over ${team.district}.`,
      };
    }

    setRescueTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              memberIds: t.memberIds.filter((id) => id !== userId),
              memberCount: Math.max(0, t.memberCount - 1),
              lastStatusUpdate: 'Just now',
            }
          : t
      )
    );

    // Clear user assigned team
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, assignedTeamId: undefined, assignedTeamName: undefined }
          : u
      )
    );

    return {
      success: true,
      message: `Removed ${user ? user.name : 'member'} from ${team.name}.`,
    };
  };

  const value = {
    currentUser,
    users,
    rescueTeams,
    presets: ROLE_SWITCHER_PRESETS,
    activePresetId,
    switchRolePreset,
    switchUser,
    canManageRole,
    canManageUser,
    canAccessState,
    canAccessDistrict,
    canCreateRole,
    getCreatableRoles,
    canDispatchRescueTeams,
    canAssignIncidentOfficers,
    canBroadcastEmergency,
    canManagePersonnel,
    isSuperAdmin,
    isStateAdmin,
    isDistrictAdmin,
    isFieldOfficer,
    isRescueTeamMember,
    createUser,
    updateUser,
    deleteUser,
    createRescueTeam,
    updateRescueTeam,
    deleteRescueTeam,
    addMemberToTeam,
    removeMemberFromTeam,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
