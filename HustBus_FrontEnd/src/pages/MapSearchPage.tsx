import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SimpleMapViewer from '../components/SimpleMapViewer.tsx';
import PlaceAutocomplete from '../components/PlaceAutocomplete.tsx';
import RouteSummaryCard from '../components/RouteSummaryCard.tsx';
import { Button } from '../components/ui/button.tsx';
import { findRoutes } from '../services/api.ts';
import { reverseGeocode } from '../services/geocoding.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { ArrowLeft, Search, MapPin, Loader2, Trash2 } from 'lucide-react';

// Key dùng để lưu trữ trong Session Storage
const STORAGE_KEY = 'map-search-state';
// Giới hạn kích thước Sidebar
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;

export default function MapSearchPage() {
    const navigate = useNavigate();
    useAuth();

    // --- State Initialization ---
    const getSavedState = () => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    };

    const savedState = getSavedState();

    // --- State: Layout Resizing ---
    const [sidebarWidth, setSidebarWidth] = useState(400); // Mặc định 400px
    const isResizing = useRef(false);

    // --- State: Input & Selection ---
    const [fromPlace, setFromPlace] = useState<any>(savedState.from || null);
    const [toPlace, setToPlace] = useState<any>(savedState.to || null);
    const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);

    // --- State: Data & UI ---
    const [routes, setRoutes] = useState<any[]>(savedState.routes || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Effect: Auto-save ---
    useEffect(() => {
        const stateToSave = {
            from: fromPlace,
            to: toPlace,
            routes: routes
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [fromPlace, toPlace, routes]);

    // --- Logic: Resizing Sidebar ---
    const startResizing = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize'; // Đổi con trỏ chuột toàn trang
        document.body.style.userSelect = 'none';     // Chặn bôi đen văn bản khi kéo

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;

        // Tính toán chiều rộng mới dựa trên vị trí chuột (e.clientX)
        // Giới hạn trong khoảng MIN_WIDTH và MAX_WIDTH
        let newWidth = e.clientX;
        if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
        if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

        setSidebarWidth(newWidth);
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
    }, [handleMouseMove]);


    // --- Logic: Map & Search ---
    const handleMapClick = async (lat: number, lng: number) => {
        if (!activeField) return;

        try {
            const tempPlace = {
                label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                coords: { lat, lng }
            };

            if (activeField === 'from') setFromPlace(tempPlace);
            else setToPlace(tempPlace);

            const place = await reverseGeocode([lat, lng]);

            const newPlace = {
                label: place.shortName || place.name,
                fullName: place.name,
                coords: { lat, lng }
            };

            if (activeField === 'from') {
                setFromPlace(newPlace);
                setActiveField('to');
            } else if (activeField === 'to') {
                setToPlace(newPlace);
                setActiveField(null);
            }
        } catch (err) {
            console.error('Error fetching address:', err);
        }
    };

    const handleSearch = async () => {
        if (!fromPlace?.coords || !toPlace?.coords) return;

        setLoading(true);
        setError(null);
        setRoutes([]);

        try {
            const response = await findRoutes({
                from: fromPlace.coords,
                to: toPlace.coords,
            }) as any;

            if (response.walkingRoute) {
                setRoutes([{
                    id: 'walking',
                    title: 'Đi bộ',
                    from: response.from,
                    to: response.to,
                    segments: [{
                        mode: 'walk',
                        duration: response.walkingRoute.duration,
                        from: response.from.id,
                        to: response.to.id
                    }],
                    summary: {
                        totalDuration: response.walkingRoute.duration,
                        totalCost: 0,
                        transfers: 0,
                        startWalkTime: response.walkingRoute.duration
                    },
                    coordinates: [response.from, response.to]
                }]);
            } else {
                setRoutes(response.routes);
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không tìm thấy lộ trình phù hợp.');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setFromPlace(null);
        setToPlace(null);
        setRoutes([]);
        sessionStorage.removeItem(STORAGE_KEY);
    };

    const mapCoordinates = useMemo(() => {
        const coords = [];
        if (fromPlace?.coords) coords.push({ ...fromPlace, name: 'Điểm đi' });
        if (toPlace?.coords) coords.push({ ...toPlace, name: 'Điểm đến' });
        return coords;
    }, [fromPlace, toPlace]);

    const activeRoute = routes[0];

    const getInputContainerClass = (field: 'from' | 'to') => {
        const isActive = activeField === field;
        return `relative p-2 rounded-lg border-2 transition-colors cursor-pointer ${isActive
                ? 'border-orange bg-orange/5 ring-1 ring-orange'
                : 'border-transparent bg-gray-50 hover:bg-gray-100'
            }`;
    };

    return (
        // SỬA: Thêm 'overflow-hidden' vào container chính để chặn scroll toàn trang
        // SỬA: Đảm bảo chiều cao tính toán chính xác để khớp với màn hình
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
            <div className="flex flex-1 overflow-hidden relative">

                {/* --- LEFT SIDEBAR (RESIZABLE) --- */}
                <div
                    className="bg-white border-r border-gray-200 flex flex-col z-10 shadow-xl flex-shrink-0"
                    style={{ width: sidebarWidth }}
                >
                    {/* Input Section giữ nguyên */}
                    <div className="p-4 border-b border-gray-100 bg-white">
                        {/* ... nội dung input ... */}
                        <div className="flex justify-between items-center mb-4">
                            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-500 pl-0">
                                <ArrowLeft className="h-4 w-4 mr-1" /> Trang chủ
                            </Button>
                            {(fromPlace || toPlace) && (
                                <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2">
                                    <Trash2 className="h-4 w-4 mr-1" /> Xóa
                                </Button>
                            )}
                        </div>

                        <h2 className="text-lg font-bold text-navy mb-4">Tìm đường trên bản đồ</h2>

                        <div className="space-y-3">
                            <div className={getInputContainerClass('from')} onClick={() => setActiveField('from')}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-blue-600 shadow-sm"></div>
                                    <span className={`text-xs font-bold ${activeField === 'from' ? 'text-orange' : 'text-gray-500'}`}>
                                        Điểm đi {activeField === 'from' && '(Đang chọn...)'}
                                    </span>
                                </div>
                                <PlaceAutocomplete
                                    value={fromPlace}
                                    onChange={setFromPlace}
                                    placeholder="Nhập hoặc click bản đồ"
                                    className="border-none shadow-none p-0 h-auto bg-transparent placeholder:text-gray-400 focus-visible:ring-0"
                                />
                            </div>

                            <div className={getInputContainerClass('to')} onClick={() => setActiveField('to')}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-red-600 shadow-sm"></div>
                                    <span className={`text-xs font-bold ${activeField === 'to' ? 'text-orange' : 'text-gray-500'}`}>
                                        Điểm đến {activeField === 'to' && '(Đang chọn...)'}
                                    </span>
                                </div>
                                <PlaceAutocomplete
                                    value={toPlace}
                                    onChange={setToPlace}
                                    placeholder="Nhập hoặc click bản đồ"
                                    className="border-none shadow-none p-0 h-auto bg-transparent placeholder:text-gray-400 focus-visible:ring-0"
                                />
                            </div>

                            <Button
                                onClick={handleSearch}
                                disabled={loading || !fromPlace || !toPlace}
                                className="w-full bg-navy hover:bg-navy/90 text-white mt-2"
                            >
                                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4 mr-2" />}
                                Tìm lộ trình
                            </Button>
                        </div>
                    </div>

                    {/* Results List - Phần này có overflow-y-auto nên sẽ cuộn độc lập */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 mb-4">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {routes.map((route, idx) => (
                                <RouteSummaryCard
                                    key={idx}
                                    route={route}
                                    highlight={idx === 0}
                                />
                            ))}
                        </div>

                        {!loading && routes.length === 0 && !error && (
                            <div className="text-center text-gray-400 py-12 text-sm flex flex-col items-center">
                                <MapPin className="h-10 w-10 mb-3 opacity-20" />
                                <p>Chọn điểm đi và điểm đến trên bản đồ<br />để bắt đầu tìm kiếm.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Resizer & Map giữ nguyên */}
                <div
                    className="w-1.5 bg-gray-200 hover:bg-orange cursor-col-resize z-20 flex items-center justify-center transition-colors group"
                    onMouseDown={startResizing}
                >
                    <div className="h-8 w-1 rounded-full bg-gray-400 group-hover:bg-white/80"></div>
                </div>

                <div className="flex-1 relative min-w-0">
                    <SimpleMapViewer
                        coordinates={mapCoordinates}
                        geometries={activeRoute?.geometries}
                        segments={activeRoute?.segments}
                        onMapClick={handleMapClick}
                    />

                    {activeField && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-orange z-[1000] text-sm font-medium text-orange flex items-center animate-bounce">
                            <MapPin className="h-4 w-4 mr-2" />
                            Đang chọn {activeField === 'from' ? 'Điểm đi' : 'Điểm đến'}... Click vào bản đồ
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
