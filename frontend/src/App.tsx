import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { VibeProvider } from './contexts/VibeContext';
import { ShopThemeProvider } from './contexts/ShopThemeContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import ChoosePathPage from './pages/ChoosePathPage';
import ProductsPage from './pages/ProductsPage';
import CartPage from './pages/CartPage';
import WardrobePage from './pages/WardrobePage';
import VendorDashboardPage from './pages/VendorDashboardPage';
import VendorProductCreatePage from './pages/VendorProductCreatePage';
import VendorProductListPage from './pages/VendorProductListPage';
import ConnectedAccountsPage from './pages/ConnectedAccountsPage';
import MetaCallbackPage from './pages/MetaCallbackPage';
import InstagramCallbackPage from './pages/InstagramCallbackPage';
import InboxPage from './pages/InboxPage';
import VendorOrdersPage from './pages/VendorOrdersPage';
import VendorProductDetailPage from './pages/VendorProductDetailPage';
import VendorProductEditPage from './pages/VendorProductEditPage';
import VendorOrderInvoicePage from './pages/VendorOrderInvoicePage';
import VendorOrderDetailPage from './pages/VendorOrderDetailPage';
import VendorStoreSettingsPage from './pages/VendorStoreSettingsPage';
import VendorAssistantSettingsPage from './pages/VendorAssistantSettingsPage';
import VendorTeamPage from './pages/VendorTeamPage';
import VendorCustomersPage from './pages/VendorCustomersPage';
import VendorAnalyticsPage from './pages/VendorAnalyticsPage';
import PublishingCalendarPage from './pages/PublishingCalendarPage';
import VendorSignupPage from './pages/VendorSignupPage';
import VendorOnboardingPage from './pages/VendorOnboardingPage';
import VendorOnboardingSuccessPage from './pages/VendorOnboardingSuccessPage';
import VendorLoginPage from './pages/VendorLoginPage';
import VendorEmailVerificationPage from './pages/VendorEmailVerificationPage';
import PublicStorePage from './pages/PublicStorePage';
import DiscoveryPage from './pages/DiscoveryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import DataDeletionPage from './pages/DataDeletionPage';
import ThemePickerButton from './components/theme/ThemePickerButton';
import './index.css';

function App() {
  return (
    <ShopThemeProvider>
      <VibeProvider>
        <Provider store={store}>
          <Router>
            <Routes>
              {/* Standalone Pages (No Layout wrapper) */}
              <Route path="/" element={<HomePage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/data-deletion" element={<DataDeletionPage />} />
              <Route path="/choose-path" element={<ChoosePathPage />} />
              <Route path="/vendor/onboarding" element={<VendorOnboardingPage />} />
              <Route path="/vendor/onboarding/success" element={<VendorOnboardingSuccessPage />} />
              <Route path="/vendor/signup" element={<VendorSignupPage />} />
              <Route path="/vendor/login" element={<VendorLoginPage />} />
              <Route path="/vendor/verify-email" element={<VendorEmailVerificationPage />} />
              <Route path="/vendor" element={<VendorDashboardPage />} />
              <Route path="/vendor/products" element={<VendorProductListPage />} />
              <Route path="/vendor/products/new" element={<VendorProductCreatePage />} />
              <Route path="/vendor/products/:id" element={<VendorProductDetailPage />} />
              <Route path="/vendor/products/:id/edit" element={<VendorProductEditPage />} />
              <Route path="/vendor/orders/:id" element={<VendorOrderDetailPage />} />
              <Route path="/vendor/orders/:id/invoice" element={<VendorOrderInvoicePage />} />
              <Route path="/vendor/customers" element={<VendorCustomersPage />} />
              <Route path="/vendor/analytics" element={<VendorAnalyticsPage />} />
              <Route path="/vendor/settings/profile" element={<VendorStoreSettingsPage />} />
              <Route path="/vendor/settings/assistant" element={<VendorAssistantSettingsPage />} />
              <Route path="/vendor/settings/team" element={<VendorTeamPage />} />
              <Route path="/vendor/settings/accounts" element={<ConnectedAccountsPage />} />
              <Route path="/vendor/settings/meta-callback" element={<MetaCallbackPage />} />
              <Route path="/vendor/settings/instagram-callback" element={<InstagramCallbackPage />} />
              <Route path="/vendor/inbox" element={<InboxPage />} />
              <Route path="/vendor/orders" element={<VendorOrdersPage />} />
              <Route path="/vendor/calendar" element={<PublishingCalendarPage />} />

              {/* Main App Layout (with Header/Footer) */}
              <Route element={<Layout><Outlet /></Layout>}>
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/wardrobe" element={<WardrobePage />} />
                <Route path="/discover" element={<DiscoveryPage />} />
                <Route path="/product/:id" element={<ProductDetailPage />} />

                <Route path="/store/:subdomain" element={<PublicStorePage />} />
              </Route>
              <Route path="/dashboard" element={<Navigate to="/vendor" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ThemePickerButton />
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
    </ShopThemeProvider>
  );
}

export default App;
