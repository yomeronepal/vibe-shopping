
import { Navigate, Outlet } from 'react-router-dom';
import { authApi } from '../../api/auth';

const ProtectedRoute = () => {
    const token = authApi.getToken();

    if (!token) {
        return <Navigate to="/vendor/login" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
