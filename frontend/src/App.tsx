import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { VibeProvider } from './contexts/VibeContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import CartPage from './pages/CartPage';
import WardrobePage from './pages/WardrobePage';
import VendorPage from './pages/VendorPage';
import VendorSignupPage from './pages/VendorSignupPage';
import PublicStorePage from './pages/PublicStorePage';
import VibeToggle from './components/theme/VibeToggle';
import './index.css';

function App() {
  return (
    <VibeProvider>
      <Provider store={store}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/wardrobe" element={<WardrobePage />} />
              <Route path="/vendor" element={<VendorPage />} />
              <Route path="/vendor" element={<VendorPage />} />
              <Route path="/vendor/signup" element={<VendorSignupPage />} />
              <Route path="/store/:subdomain" element={<PublicStorePage />} />
            </Routes>
          </Layout>
          <VibeToggle />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#fff',
                color: '#0c4a6e',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              },
              success: {
                iconTheme: {
                  primary: '#0ea5e9',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Router>
      </Provider>
    </VibeProvider>
  );
}

export default App;
