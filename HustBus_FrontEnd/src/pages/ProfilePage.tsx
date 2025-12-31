import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.tsx';
import { fetchProfile, removeFavorite, deleteHistory, uploadAvatar, getFavorites, getHistory } from '../services/api.ts';
import { Button } from '../components/ui/button.tsx';
import { Loader2, Trash2, Eye, History, ShieldCheck, Upload, User } from 'lucide-react';
import { resolveAvatarUrl } from '../lib/avatar';

interface FavoriteItem {
    id: string;
    routeId: string;
    label: string;
    savedAt?: string;
}

interface HistoryItem {
    id: string;
    from?: { label: string; coords?: { lat: number; lng: number } } | null;
    to?: { label: string; coords?: { lat: number; lng: number } } | null;
    createdAt?: string;
    timestamp?: number;
}

export default function ProfilePage() {
    const { user, isAuthenticated, isAdmin, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

    const loadProfile = async () => {
        if (!isAuthenticated) return;
        try {
            setLoading(true);
            // Fetch user profile, favorites, and history separately
            const [, favoritesData, historyData] = await Promise.all([
                fetchProfile(),
                getFavorites().catch(() => ({ favorites: [] })),
                getHistory().catch(() => ({ history: [] }))
            ]);

            setFavorites((favoritesData as any).favorites || []);
            setHistory((historyData as any).history || []);

            setError(null);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không thể tải thông tin người dùng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, [isAuthenticated]);

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file size (3MB)
        if (file.size > 3 * 1024 * 1024) {
            setError('File ảnh quá lớn. Kích thước tối đa 3MB.');
            return;
        }

        // Validate file type
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
            setError('Chỉ chấp nhận file ảnh (JPG, PNG, WebP).');
            return;
        }

        try {
            setUploading(true);
            setError(null);
            setUploadSuccess(null);

            const data = await uploadAvatar(file);
            setUploadSuccess(data.message || 'Upload ảnh thành công!');

            // Refresh user data to update avatar
            await refreshUser();

            // Also reload profile favorites/history
            await loadProfile();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không thể upload ảnh. Vui lòng thử lại.');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveFavorite = async (id: string) => {
        try {
            await removeFavorite(id);
            setFavorites((prev) => prev.filter((fav) => fav.id !== id));
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không thể xoá lộ trình.');
        }
    };

    const handleDeleteHistory = async (id: string) => {
        try {
            await deleteHistory(id);
            setHistory((prev) => prev.filter((item) => item.id !== id));
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không thể xoá lịch sử.');
        }
    };

    const handleHistoryClick = (item: HistoryItem) => {
        // Navigate to home page with query parameters
        const params = new URLSearchParams();

        if (item.from?.label && item.from?.coords) {
            params.set('fromLabel', item.from.label);
            params.set('fromLat', item.from.coords.lat.toString());
            params.set('fromLng', item.from.coords.lng.toString());
        }

        if (item.to?.label && item.to?.coords) {
            params.set('toLabel', item.to.label);
            params.set('toLat', item.to.coords.lat.toString());
            params.set('toLng', item.to.coords.lng.toString());
        }

        // Add flag to indicate coming from history (for auto-scroll)
        params.set('fromHistory', 'true');

        navigate(`/?${params.toString()}`);
    };

    if (!isAuthenticated) {
        return (
            <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[60vh]">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-8 text-center space-y-4">
                    <h2 className="text-2xl font-bold text-navy">Đăng nhập để đồng bộ</h2>
                    <p className="text-gray-500 text-sm">Lưu lộ trình yêu thích, đánh giá trạm và xem lại lịch sử tìm kiếm trên mọi thiết bị.</p>
                    <div className="flex gap-3 justify-center">
                        <Link to="/login">
                            <Button className="bg-orange text-white">Đăng nhập</Button>
                        </Link>
                        <Link to="/register">
                            <Button variant="outline" className="border-orange text-orange">Đăng ký</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
            <header className="p-6 bg-navy text-white rounded-2xl shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    {/* Left: Avatar + Info */}
                    <div className="flex items-center gap-6">
                        {/* Avatar Preview */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border-4 border-orange/30">
                                {user?.path_url ? (
                                    <img
                                        src={resolveAvatarUrl(user.path_url) || undefined}
                                        alt={user.name || 'Avatar'}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <User className="h-12 w-12 text-white/50" />
                                )}
                            </div>
                            {/* Upload Button */}
                            <label
                                htmlFor="avatar-upload"
                                className="absolute bottom-0 right-0 bg-orange hover:bg-orange/90 text-white p-2 rounded-full cursor-pointer shadow-lg transition-all"
                                title="Thay đổi ảnh đại diện"
                            >
                                <Upload className="h-4 w-4" />
                                <input
                                    id="avatar-upload"
                                    type="file"
                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                    onChange={handleAvatarUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>
                        </div>

                        {/* User Info */}
                        <div>
                            <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-1">Xin chào</p>
                            <h1 className="text-3xl font-bold mb-1">{user?.name || user?.email}</h1>
                            <p className="text-white/70 text-sm">{user?.email}</p>
                            {uploading && (
                                <p className="text-sm text-orange mt-2 flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Đang upload...
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right: Admin Link (only for admins) */}
                    {isAdmin && (
                        <div className="flex items-center gap-3">
                            <Link to="/admin/users">
                                <Button variant="outline" className="text-white border-white/30 hover:bg-white/10 flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4" /> Quản trị người dùng
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </header>

            {uploadSuccess && (
                <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                    {uploadSuccess}
                </p>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-orange" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <section className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-navy">Lộ trình đã lưu</h2>
                            <span className="text-sm text-gray-500">{favorites.length} mục</span>
                        </div>

                        {favorites.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                Chưa có lộ trình nào. Thử tìm kiếm và lưu lại nhé!
                            </div>
                        ) : (
                            <ul className="space-y-4">
                                {favorites.map((fav) => (
                                    <li key={fav.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-100">
                                        <div>
                                            <strong className="block text-navy text-lg mb-1">{fav.label}</strong>
                                            <p className="text-sm text-gray-500">Lưu lúc: {fav.savedAt ? new Date(fav.savedAt).toLocaleString() : '—'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Link to={`/saved-route/${fav.id}`}>
                                                <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                                                    <Eye className="h-4 w-4 mr-1" /> Xem lại
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveFavorite(fav.id)}
                                                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-fit">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-navy flex items-center gap-2">
                                <History className="h-5 w-5 text-orange" /> Lịch sử tìm kiếm
                            </h2>
                            <span className="text-sm text-gray-500">{history.length} mục</span>
                        </div>

                        {history.length === 0 ? (
                            <p className="text-sm text-gray-500">Chưa có lịch sử được lưu.</p>
                        ) : (
                            <ul className="space-y-3">
                                {history.map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex items-start justify-between p-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-md hover:border-orange/30 transition-all cursor-pointer group"
                                        onClick={() => handleHistoryClick(item)}
                                        title="Click để tìm lại lộ trình này"
                                    >
                                        <div className="flex-1">
                                            <p className="font-semibold text-navy text-sm group-hover:text-orange transition-colors">
                                                {item.from?.label || 'Điểm đi'} → {item.to?.label || 'Điểm đến'}
                                            </p>
                                            <p className="text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteHistory(item.id);
                                            }}
                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                                            title="Xoá lịch sử"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
