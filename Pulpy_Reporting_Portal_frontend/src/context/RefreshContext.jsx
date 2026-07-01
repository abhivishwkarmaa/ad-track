import { createContext, useContext, useState, useCallback } from 'react';
import { queryClient } from '../lib/queryClient';
import { referenceDataRootKeys } from '../lib/queryKeys';

const RefreshContext = createContext();

export const useRefresh = () => {
    const context = useContext(RefreshContext);
    if (!context) {
        throw new Error('useRefresh must be used within a RefreshProvider');
    }
    return context;
};

export const RefreshProvider = ({ children }) => {
    const [refreshKey, setRefreshKey] = useState(0);

    const triggerRefresh = useCallback(() => {
        referenceDataRootKeys.forEach((queryKey) => {
            queryClient.invalidateQueries({ queryKey });
        });
        setRefreshKey((prev) => prev + 1);
    }, []);

    return (
        <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
            {children}
        </RefreshContext.Provider>
    );
};

export default RefreshContext;
