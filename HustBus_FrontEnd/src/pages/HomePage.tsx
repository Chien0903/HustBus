import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, MapPin, Loader2, Trash2, Crosshair } from 'lucide-react';

import SimpleMapViewer from '../components/SimpleMapViewer.tsx';
import PlaceAutocomplete from '../components/PlaceAutocomplete.tsx';
import RouteSummaryCard from '../components/RouteSummaryCard.tsx';
import { VideoHero } from '../components/VideoHero.tsx';
import { Button } from '../components/ui/button.tsx';

import { findRoutes } from '../services/api.ts';
import { reverseGeocode } from '../services/geocoding.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import useGeolocation from '../hooks/useGeolocation.ts';

// Key lưu trữ session
const STORAGE_KEY = 'home-map-search-state';
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;

export default function HomePage() {
    useAuth();
    const { requestPosition, loading: locating } = useGeolocation();
    const [searchParams, setSearchParams] = useSearchParams();

    // --- Refs ---
    const mainContentRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);

    // --- State Initialization ---
    const getSavedState = () => {
        try {
            if (typeof window === 'undefined') return {};
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    };
    const savedState = getSavedState();

    // --- States ---
    const [sidebarWidth, setSidebarWidth] = useState(400);
    // State kiểm tra màn hình Desktop (để xử lý responsive logic trong JS nếu cần)
    const [isDesktop, setIsDesktop] = useState(true);

    const [fromPlace, setFromPlace] = useState<any>(savedState.from || null);
    const [toPlace, setToPlace] = useState<any>(savedState.to || null);
    const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);
    const [routes, setRoutes] = useState<any[]>(savedState.routes || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [selectedFilter, setSelectedFilter] = useState<'fastest' | 'fewest_transfers' | 'least_walking'>('fastest');

    // --- Effects ---

    // 1. Check window size cập nhật state isDesktop
    useEffect(() => {
        const checkScreen = () => setIsDesktop(window.innerWidth >= 768);
        checkScreen(); // Check ngay khi mount
        window.addEventListener('resize', checkScreen);
        return () => window.removeEventListener('resize', checkScreen);
    }, []);

    // 2. Save state vào Session Storage
    useEffect(() => {
        const stateToSave = { from: fromPlace, to: toPlace, routes: routes };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [fromPlace, toPlace, routes]);

    // 3. Read URL query parameters and pre-fill fields (from profile history)
    useEffect(() => {
        const fromLabel = searchParams.get('fromLabel');
        const fromLat = searchParams.get('fromLat');
        const fromLng = searchParams.get('fromLng');
        const toLabel = searchParams.get('toLabel');
        const toLat = searchParams.get('toLat');
        const toLng = searchParams.get('toLng');
        const fromHistory = searchParams.get('fromHistory');

        // Only apply if params exist and fields are empty
        if (fromLabel && fromLat && fromLng && !fromPlace) {
            setFromPlace({
                label: fromLabel,
                fullName: fromLabel,
                coords: {
                    lat: parseFloat(fromLat),
                    lng: parseFloat(fromLng)
                }
            });
        }

        if (toLabel && toLat && toLng && !toPlace) {
            setToPlace({
                label: toLabel,
                fullName: toLabel,
                coords: {
                    lat: parseFloat(toLat),
                    lng: parseFloat(toLng)
                }
            });
        }

        // Scroll to search section if coming from history
        if (fromHistory && mainContentRef.current) {
            setTimeout(() => {
                mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        // Clear query parameters after applying
        if (fromLabel || toLabel) {
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

    // --- Handlers ---
    const handleScrollDown = () => {
        if (mainContentRef.current) {
            mainContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Logic kéo thả thay đổi kích thước Sidebar (chỉ dùng cho Desktop)
    const startResizing = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
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

    // --- Logic Lấy vị trí hiện tại ---
    const handleUseCurrentLocation = async () => {
        try {
            const coords = await requestPosition();

            let newPlace = {
                label: 'Vị trí của bạn',
                fullName: 'Đang xác định địa chỉ...',
                coords: coords
            };
            setFromPlace(newPlace);

            try {
                const placeInfo = await reverseGeocode([coords.lat, coords.lng]);
                newPlace = {
                    label: placeInfo.shortName || 'Vị trí của bạn',
                    fullName: placeInfo.name,
                    coords: coords
                };
                setFromPlace(newPlace);
            } catch (err) {
                console.warn('Reverse geocode failed');
            }
        } catch (err: any) {
            setError(err.message || 'Không thể lấy vị trí hiện tại.');
        }
    };

    const handleMapClick = async (lat: number, lng: number) => {
        if (!activeField) return;

        try {
            const tempPlace = { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, coords: { lat, lng } };
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
            console.error(err);
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

            // Transform routes from /path/find API to match RouteSummaryCard format
            if (response.routes && response.routes.length > 0) {
                const transformedRoutes = response.routes.map((route: any) => {
                    // Transform segments to expected format (backend already includes walking segment)
                    const transformedSegments = route.segments.map((seg: any) => ({
                        lineId: seg.lineId || 'walk',
                        lineName: seg.lineName || 'Đi bộ',
                        mode: seg.mode,
                        duration: seg.duration_min || Math.ceil((seg.duration_sec || 0) / 60),
                        cost: seg.fare || 0,
                        from: seg.from_stop || 'origin',
                        to: seg.to_stop,
                        fromStopName: seg.fromStopName || (seg.from_coordinates ? fromPlace.label || 'Điểm xuất phát' : ''),
                        toStopName: seg.toStopName,
                        // Keep coordinates for ORS geometry fetching
                        from_coordinates: seg.from_coordinates,
                        to_coordinates: seg.to_coordinates,
                        waiting_time_sec: seg.waiting_time_sec
                    }));

                    return {
                        id: route.route_id,
                        title: route.summary || 'Lộ trình',
                        filters: route.filters || [], // Filter tags from backend
                        from: {
                            id: route.origin_stop?.id,
                            name: route.origin_stop?.name,
                            coords: {
                                lat: route.origin_stop?.lat,
                                lng: route.origin_stop?.lon
                            }
                        },
                        to: {
                            name: 'Điểm đến',
                            coords: route.destination_coordinates
                        },
                        segments: transformedSegments, // Use backend segments (includes walking)
                        summary: {
                            totalDuration: Math.ceil((route.details?.total_time_sec || 0) / 60),
                            totalCost: route.details?.total_fare || 0, // Use backend total_fare
                            transfers: route.details?.transfers_count || 0,
                            startWalkTime: Math.ceil((route.details?.walking_time_sec || 0) / 60)
                        },
                        details: route.details // Pass through for RouteSummaryCard
                    };
                });

                setRoutes(transformedRoutes);
            } else {
                setError('Không tìm thấy lộ trình phù hợp.');
            }

            // Nếu là Desktop thì scroll xuống, còn Mobile thì map đã ở trên rồi ko cần scroll
            if (isDesktop) handleScrollDown();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Không tìm thấy lộ trình.');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setFromPlace(null);
        setToPlace(null);
        setRoutes([]);
        setError(null);
        sessionStorage.removeItem(STORAGE_KEY);
        setResetKey(prev => prev + 1);
    };

    // --- Helpers ---
    const mapCoordinates = useMemo(() => {
        const coords = [];
        if (fromPlace?.coords) coords.push({ ...fromPlace, name: 'Điểm đi' });
        if (toPlace?.coords) coords.push({ ...toPlace, name: 'Điểm đến' });
        return coords;
    }, [fromPlace, toPlace]);

    const activeRoute = routes[0];

    // Helper tạo class chung cho các ô input
    const getContainerClass = (field: 'from' | 'to') => {
        const isActive = activeField === field;
        return `flex items-center rounded-lg border-2 transition-colors relative ${isActive ? 'border-red bg-red/5 ring-1 ring-red' : 'border-transparent bg-white/90 hover:bg-white'
            }`;
    };

    return (
        <div className="flex flex-col min-h-screen">

            {/* --- VIDEO HERO SECTION --- */}
            <VideoHero onStartClick={handleScrollDown} />

            {/* --- GIAO DIỆN BẢN ĐỒ & TÌM KIẾM --- */}
            <div
                ref={mainContentRef}
                // Flex-col cho mobile (dọc), md:flex-row cho desktop (ngang)
                className="flex flex-col md:flex-row h-[calc(100vh-64px)] relative border-b border-gray-200 bg-white scroll-mt-16"
            >
                {/* --- KHỐI 1: SIDEBAR TÌM KIẾM --- */}
                {/* Mobile: Order 2 (nằm dưới map). Desktop: Order 1 (nằm bên trái) */}
                <div
                    className="relative bg-cover bg-center border-r border-gray-200 flex flex-col z-10 shadow-xl flex-shrink-0 order-2 md:order-1 w-full md:w-auto
                        max-h-[50vh] overflow-y-auto md:max-h-none"
                    style={isDesktop ? { width: sidebarWidth, backgroundImage: "url('/assets/tet/tet-3.png')", backgroundRepeat: 'no-repeat', backgroundSize: 'cover' } : {}}
                >
                    {/* overlay to ensure inputs remain readable - brighter for Tết theme */}
                    <div className="absolute inset-0 bg-white/10 pointer-events-none"></div>
                    <div className="p-4 border-b border-gray-100 bg-transparent relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-navy">Tra cứu lộ trình</h2>
                            {(fromPlace || toPlace || routes.length > 0) && (
                                <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2">
                                    <Trash2 className="h-4 w-4 mr-1" /> Xóa
                                </Button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {/* --- INPUT ĐIỂM ĐI --- */}
                            <div className={getContainerClass('from')}>
                                <div
                                    className="flex-1 p-2 cursor-pointer"
                                    onClick={() => setActiveField('from')}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-600 shadow-sm"></div>
                                        <span className={`text-xs font-bold ${activeField === 'from' ? 'text-orange' : 'text-gray-500'}`}>
                                            Điểm đi {activeField === 'from' && '(Đang chọn...)'}
                                        </span>
                                    </div>
                                    <PlaceAutocomplete
                                        key={`from-${resetKey}`}
                                        value={fromPlace}
                                        onChange={setFromPlace}
                                        placeholder="Nhập hoặc click bản đồ"
                                        className="border-none shadow-none p-0 h-auto bg-transparent placeholder:text-gray-400 focus-visible:ring-0 w-full"
                                    />
                                </div>
                                <div className="pr-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-full transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUseCurrentLocation();
                                        }}
                                        disabled={locating}
                                        title="Lấy vị trí hiện tại"
                                    >
                                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            {/* --- INPUT ĐIỂM ĐẾN --- */}
                            <div className={getContainerClass('to')} onClick={() => setActiveField('to')}>
                                <div className="flex-1 p-2 cursor-pointer">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full bg-red-600 shadow-sm"></div>
                                        <span className={`text-xs font-bold ${activeField === 'to' ? 'text-orange' : 'text-gray-500'}`}>
                                            Điểm đến {activeField === 'to' && '(Đang chọn...)'}
                                        </span>
                                    </div>
                                    <PlaceAutocomplete
                                        key={`to-${resetKey}`}
                                        value={toPlace}
                                        onChange={setToPlace}
                                        placeholder="Nhập hoặc click bản đồ"
                                        className="border-none shadow-none p-0 h-auto bg-transparent placeholder:text-gray-400 focus-visible:ring-0 w-full"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={handleSearch}
                                disabled={loading || !fromPlace || !toPlace}
                                className="w-full bg-navy hover:bg-navy/90 text-white mt-2 py-3 md:py-6 font-bold text-base shadow-sm"
                            >
                                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Search className="h-5 w-5 mr-2" />}
                                Tìm lộ trình
                            </Button>
                        </div>
                    </div>

                    {/* Danh sách kết quả */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 min-h-[200px]">
                        {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 mb-4">{error}</div>}

                        {/* Filter button group - only show if there are routes */}
                        {routes.length > 0 && (
                                    <div className="mb-4">
                                <div className="inline-flex rounded-lg border border-red overflow-hidden w-full max-w-md">
                                    <button
                                        onClick={() => setSelectedFilter('fastest')}
                                        className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors border-r border-red ${selectedFilter === 'fastest'
                                            ? 'bg-red-600 text-white shadow-md hover:bg-red-700'
                                            : 'bg-white text-red-600 hover:bg-red-50 hover:text-red-700'
                                            }`}
                                    >
                                        Nhanh nhất
                                    </button>
                                    <button
                                        onClick={() => setSelectedFilter('fewest_transfers')}
                                        className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors border-r border-red ${selectedFilter === 'fewest_transfers'
                                            ? 'bg-red-600 text-white shadow-md hover:bg-red-700'
                                            : 'bg-white text-red-600 hover:bg-red-50 hover:text-red-700'
                                            }`}
                                    >
                                        Ít chuyển tuyến
                                    </button>
                                    <button
                                        onClick={() => setSelectedFilter('least_walking')}
                                        className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${selectedFilter === 'least_walking'
                                            ? 'bg-red-600 text-white shadow-md hover:bg-red-700'
                                            : 'bg-white text-red-600 hover:bg-red-50 hover:text-red-700'
                                            }`}
                                    >
                                        Ít đi bộ
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            {routes
                                .slice() // Create a copy to avoid mutating original array
                                .sort((a, b) => {
                                    // Check if routes are walking-only (all segments are walking)
                                    const aIsWalkOnly = a.segments?.every((seg: any) => seg.mode === 'walk') ?? false;
                                    const bIsWalkOnly = b.segments?.every((seg: any) => seg.mode === 'walk') ?? false;

                                    // Always put walking-only routes at the bottom
                                    if (aIsWalkOnly && !bIsWalkOnly) return 1;
                                    if (!aIsWalkOnly && bIsWalkOnly) return -1;

                                    // If both are walking-only or both are not, sort based on selected filter
                                    if (selectedFilter === 'fastest') {
                                        const aDuration = a.summary?.totalDuration ?? Infinity;
                                        const bDuration = b.summary?.totalDuration ?? Infinity;
                                        if (aDuration !== bDuration) {
                                            return aDuration - bDuration;
                                        }
                                        // Tie-breaker: fewer transfers is better
                                        return (a.summary?.transfers ?? 0) - (b.summary?.transfers ?? 0);
                                    } else if (selectedFilter === 'fewest_transfers') {
                                        const aTransfers = a.summary?.transfers ?? Infinity;
                                        const bTransfers = b.summary?.transfers ?? Infinity;
                                        if (aTransfers !== bTransfers) {
                                            return aTransfers - bTransfers;
                                        }
                                        // Tie-breaker: faster is better
                                        return (a.summary?.totalDuration ?? Infinity) - (b.summary?.totalDuration ?? Infinity);
                                    } else if (selectedFilter === 'least_walking') {
                                        // Use total walking time from route details (in seconds, convert to minutes)
                                        const aWalkTime = a.details?.walking_time_sec ?? Infinity;
                                        const bWalkTime = b.details?.walking_time_sec ?? Infinity;
                                        if (aWalkTime !== bWalkTime) {
                                            return aWalkTime - bWalkTime;
                                        }
                                        // Tie-breaker: faster is better
                                        return (a.summary?.totalDuration ?? Infinity) - (b.summary?.totalDuration ?? Infinity);
                                    }
                                    return 0;
                                })
                                .map((route, idx) => (
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

                {/* --- KHỐI 2: RESIZER BAR (Chỉ hiện Desktop) --- */}
                <div
                    className="hidden md:flex w-1.5 bg-gray-200 hover:bg-orange cursor-col-resize z-20 items-center justify-center transition-colors group order-2"
                    onMouseDown={startResizing}
                >
                    <div className="h-8 w-1 rounded-full bg-gray-400 group-hover:bg-white/80"></div>
                </div>

                {/* --- KHỐI 3: MAP COMPONENT --- */}
                {/* Mobile: Order 1 (trên cùng), h-[50vh] (50% màn hình). Desktop: Order 3 (bên phải), tự giãn */}
                <div className="relative min-w-0 bg-gray-100 order-1 md:order-3 w-full h-[50vh] md:h-auto md:flex-1">
                    {/* Wrapper w-full h-full để map chiếm trọn vẹn div cha */}
                    <div className="w-full h-full">
                        <SimpleMapViewer
                            coordinates={mapCoordinates}
                            geometries={activeRoute?.geometries}
                            segments={activeRoute?.segments}
                            onMapClick={handleMapClick}
                        />
                    </div>

                    {/* Thông báo Floating khi đang chọn điểm */}
                    {activeField && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-lg border border-orange z-[1000] text-xs md:text-sm font-medium text-orange flex items-center animate-bounce whitespace-nowrap">
                            <MapPin className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                            Đang chọn {activeField === 'from' ? 'Điểm đi' : 'Điểm đến'}...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
