import { useState, useEffect } from 'react';
import Maintenance from './pages/Maintenance/Maintenance';
import AppProviders from './app/providers';
import './App.css';

function App() {
    const [isMaintenance, setIsMaintenance] = useState(false);

    useEffect(() => {
        const handleMaintenance = () => setIsMaintenance(true);
        window.addEventListener('server-maintenance', handleMaintenance);
        return () => window.removeEventListener('server-maintenance', handleMaintenance);
    }, []);

    if (isMaintenance) {
        return <Maintenance />;
    }

    return <AppProviders />;
}

export default App;
