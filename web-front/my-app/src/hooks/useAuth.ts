import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setCredentials, logout } from '../store/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user, token } = useSelector((state: RootState) => state.auth);

  const login = (user: any, token: string) => {
    dispatch(setCredentials({ user, token }));
  };

  const handleLogout = () => {
    dispatch(logout());
  };

  return {
    isAuthenticated,
    user,
    token,
    login,
    logout: handleLogout,
  };
}; 