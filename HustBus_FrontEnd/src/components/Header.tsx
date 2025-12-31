import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.tsx';
import { User, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { resolveAvatarUrl } from '../lib/avatar';

const Header = () => {
    const { isAuthenticated, user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navLinks = [
        { to: "/", label: "Tìm lộ trình" },
        { to: "/lines", label: "Tra cứu tuyến" },
        { to: "/stops", label: "Tra cứu điểm dừng" },
    ];

    const location = useLocation();
    const pathname = location.pathname || '/';
    const isActive = (to: string) => {
        if (to === '/') return pathname === '/';
        return pathname.startsWith(to);
    };

    const handleLogout = () => {
        logout();
        setMobileMenuOpen(false);
        navigate('/login');
    };

    const closeMobileMenu = () => {
        setMobileMenuOpen(false);
    };

    return (
        <header className="bg-navy text-white shadow-lg sticky top-0 z-[999] bg-cover bg-center" style={{ backgroundImage: "url('/assets/tet/tet-2.jpg')" }}>
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold hover:text-red transition-colors" onClick={closeMobileMenu}>
                        <img
                            src="/assets/web-icon/web-icon.png"
                            alt="HustBus Logo"
                            className="h-8 w-8 object-contain"
                        />
                        <span className="hidden sm:inline">HustBus</span>
                        <span className="sm:hidden">ST</span>
                    </Link>

                    {/* Center Navigation - Desktop Only */}
                    <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`transition-colors duration-150 font-medium whitespace-nowrap hover:text-red hover:underline hover:decoration-red-300 hover:underline-offset-4 ${isActive(link.to) ? 'underline underline-offset-4 decoration-red-400 decoration-2' : ''}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* User Menu - Desktop */}
                    <nav className="hidden md:flex items-center gap-6">
                        {isAuthenticated ? (
                            <>
                                <Link to="/profile" className="flex items-center gap-2 hover:text-red transition-colors">
                                    {user?.path_url ? (
                                        <img
                                            src={resolveAvatarUrl(user.path_url) || undefined}
                                            alt={user.name || 'Avatar'}
                                            className="w-8 h-8 rounded-full object-cover border-2 border-red"
                                        />
                                    ) : (
                                        <User className="h-5 w-5" />
                                    )}
                                    <span className="hidden lg:inline">{user?.name || user?.email}</span>
                                </Link>
                                {isAdmin && (
                                    <Link to="/admin" className="px-4 py-2 bg-red hover:bg-red/90 rounded-lg font-medium transition-colors">
                                        Admin Panel
                                    </Link>
                                )}
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 hover:text-red transition-colors"
                                >
                                    <LogOut className="h-5 w-5" />
                                    <span className="hidden lg:inline">Đăng xuất</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="hover:text-red transition-colors">
                                    Đăng nhập
                                </Link>
                                <Link to="/register" className="px-4 py-2 bg-red hover:bg-red/90 rounded-lg font-medium transition-colors">
                                    Đăng ký
                                </Link>
                            </>
                        )}
                    </nav>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>

                {/* Mobile Navigation */}
                {mobileMenuOpen && (
                    <nav className="md:hidden py-4 border-t border-white/10 animate-in slide-in-from-top duration-200">
                        <div className="flex flex-col gap-3">
                            {/* Navigation Links */}
                            {navLinks.map((link) => (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={`px-4 py-3 hover:bg-white/10 rounded-lg transition-colors duration-150 text-center font-medium hover:underline hover:decoration-red-300 hover:underline-offset-4 ${isActive(link.to) ? 'underline underline-offset-4 decoration-red-400 decoration-2' : ''}`}
                                    onClick={closeMobileMenu}
                                >
                                    {link.label}
                                </Link>
                            ))}

                            {/* Separator */}
                            <div className="h-px bg-white/20 my-1"></div>

                            {isAuthenticated ? (
                                <>
                                    <Link
                                        to="/profile"
                                        className="flex items-center gap-3 p-3 hover:bg-white/10 rounded-lg transition-colors"
                                        onClick={closeMobileMenu}
                                    >
                                        {user?.path_url ? (
                                            <img
                                                src={resolveAvatarUrl(user.path_url) || undefined}
                                                alt={user.name || 'Avatar'}
                                                className="w-10 h-10 rounded-full object-cover border-2 border-red flex-shrink-0"
                                            />
                                        ) : (
                                            <User className="h-6 w-6 flex-shrink-0" />
                                        )}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="font-medium truncate">{user?.name || 'Tài khoản'}</span>
                                            <span className="text-sm text-white/70 truncate">{user?.email}</span>
                                        </div>
                                    </Link>
                                    {isAdmin && (
                                        <Link
                                                to="/admin"
                                                className="px-4 py-3 bg-red hover:bg-red/90 rounded-lg font-medium transition-colors text-center"
                                                onClick={closeMobileMenu}
                                            >
                                                Admin Panel
                                            </Link>
                                    )}
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center justify-center gap-3 p-3 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <LogOut className="h-5 w-5" />
                                        <span>Đăng xuất</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/login"
                                        className="px-4 py-3 hover:bg-white/10 rounded-lg transition-colors text-center font-medium"
                                        onClick={closeMobileMenu}
                                    >
                                        Đăng nhập
                                    </Link>
                                    <Link
                                        to="/register"
                                        className="px-4 py-3 bg-red hover:bg-red/90 rounded-lg font-medium transition-colors text-center"
                                        onClick={closeMobileMenu}
                                    >
                                        Đăng ký
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                )}
            </div>
        </header>
    );
};

export default Header;
