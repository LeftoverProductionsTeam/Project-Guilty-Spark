import { createContext, useContext } from 'react';
export const WorkspaceActivity = createContext({ active: true, scope: 'workspace' });
export const useWorkspaceActivity = () => useContext(WorkspaceActivity);
