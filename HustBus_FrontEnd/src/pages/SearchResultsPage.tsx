import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import FilterTabs from '../components/FilterTabs.tsx';
import RouteSummaryCard from '../components/RouteSummaryCard.tsx';
import { findRoutes, saveSearchHistory } from '../services/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Loader2 } from 'lucide-react';

export default function SearchResultsPage() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const [activeFilter, setActiveFilter] = useState('fastest');
    const [routes, setRoutes] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const searchPayload =
        location.state ||
        JSON.parse(sessionStorage.getItem('last-search') || 'null');

    useEffect(() => {
        if (location.state) {
            sessionStorage.setItem('last-search', JSON.stringify(location.state));
        }
    }, [location.state]);

    useEffect(() => {
        const runSearch = async () => {
            if (!searchPayload?.from || !searchPayload?.to) return;
            try {
                setLoading(true);
                const response = await findRoutes({
                    from: searchPayload.from.coords,
                    to: searchPayload.to.coords,
                }) as any;

                // Handle walking route proposal
                if (response.walkingRoute) {
                    setSummary({
                        from: response.from,
                        to: response.to,
                        walkingRoute: response.walkingRoute
                    });
                    setRoutes([]);
                } else {
                    setRoutes(response.routes);
                    setSummary({ from: response.from, to: response.to });
                }

                // Ghi lại lịch sử tìm kiếm cho người dùng đã đăng nhập
                if (isAuthenticated) {
                    saveSearchHistory({
                        from: searchPayload.from,
                        to: searchPayload.to,
                    }).catch(() => {
                        /* ignore history errors to keep UX smooth */
                    });
                }
            } catch (err: any) {
                setError(
                    err?.response?.data?.message ||
                    'Không tìm thấy lộ trình phù hợp. Vui lòng thử lại.'
                );
            } finally {
                setLoading(false);
            }
        };

        runSearch();
    }, [searchPayload, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    const sortedRoutes = useMemo(() => {
        if (!routes.length) return [];
        const target = routes.find((route) => route.filter === activeFilter);
        if (!target) return routes;
        const others = routes.filter((route) => route.id !== target.id);
        return [target, ...others];
    }, [routes, activeFilter]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    if (!searchPayload) {
        return (
            <div className="container mx-auto px-4 py-8 text-center">
                <p className="text-gray-600">Vui lòng nhập điểm đi/đến từ trang chủ để xem kết quả.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <header className="mb-8">
                <div className="mb-4">
                    <p className="text-sm font-semibold text-red uppercase tracking-wider">
                        Từ {summary?.from?.name} đến {summary?.to?.name}
                    </p>
                    <h1 className="text-3xl font-bold text-navy">Kết quả đề xuất</h1>
                </div>
                {!summary?.walkingRoute && <FilterTabs activeFilter={activeFilter} onChange={setActiveFilter} />}
            </header>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-red" />
                    <span className="ml-2 text-gray-600">Đang tìm lộ trình tối ưu...</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
                    {error}
                </div>
            )}

            {/* Show walking proposal if close */}
            {summary?.walkingRoute && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-bold text-green-800 mb-2">🚶 Đề xuất: Đi bộ</h2>
                    <p className="text-lg text-green-900 mb-4">
                        {summary.walkingRoute.message}
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm text-green-800">
                        <p><strong>Khoảng cách:</strong> {(summary.walkingRoute.distance * 1000).toFixed(0)} mét</p>
                        <p><strong>Thời gian dự kiến:</strong> {summary.walkingRoute.duration} phút</p>
                    </div>
                    <p className="mt-4 text-green-700 text-sm italic">
                        💡 Hai địa điểm của bạn nằm rất gần nhau, đi bộ sẽ nhanh và tiện hơn là đi xe buýt.
                    </p>
                </div>
            )}

            <div className="grid gap-6">
                {sortedRoutes.map((route, index) => (
                    <RouteSummaryCard
                        key={route.id}
                        route={route}
                        highlight={index === 0}
                    />
                ))}
            </div>

            {!loading && !error && !summary?.walkingRoute && sortedRoutes.length === 0 && (
                <p className="bg-gray-50 text-gray-600 p-8 rounded-xl text-center">
                    Không tìm thấy lộ trình phù hợp.
                </p>
            )}

            {toast && (
                <div className="fixed bottom-4 right-4 bg-navy text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4">
                    {toast}
                </div>
            )}
        </div>
    );
}
