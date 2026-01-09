import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    MapPin,
    Search,
    Edit,
    Trash2,
    Loader2,
    RefreshCw
} from 'lucide-react';
import axios from 'axios';

interface Stop {
    id: string;
    name: string;
    lat: number;
    lng: number;
    type?: string;
    routes?: string[];
}

export default function AdminStopsPage() {
    const [stops, setStops] = useState<Stop[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalStops, setTotalStops] = useState(0);
    const [formData, setFormData] = useState<Partial<Stop>>({
        id: '',
        name: '',
        lat: 0,
        lng: 0,
        type: 'bus_stop',
    });

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const ITEMS_PER_PAGE = 100;

    useEffect(() => {
        fetchStops();
    }, []);

    // Debounce search - tự động search sau 500ms người dùng ngừng gõ
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(1); // Reset về trang 1 khi search
            fetchStops(1, searchQuery);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchStops = async (page: number = currentPage, search: string = searchQuery) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: ITEMS_PER_PAGE.toString(),
                ...(search && { search })
            });
            const response = await axios.get(`${API_BASE}/api/stop?${params}`);
            setStops(response.data.stops);
            setTotalStops(response.data.total);
            setTotalPages(response.data.totalPages);
            setCurrentPage(page);
        } catch (error) {
            console.error('Failed to fetch stops:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateStop = async () => {
        try {
            await axios.post(`${API_BASE}/api/stop`, formData);
            // Refresh lại danh sách để hiện điểm dừng mới
            await fetchStops(1, searchQuery); // Về trang 1 để thấy item mới
            resetForm();
            alert('Thêm điểm dừng thành công!');
        } catch (error) {
            console.error('Failed to create stop:', error);
            alert('Không thể tạo điểm dừng mới');
        }
    };

    const handleUpdateStop = async () => {
        try {
            await axios.put(`${API_BASE}/api/stop/${formData.id}`, formData);
            // Refresh lại danh sách để hiện thay đổi ngay lập tức
            await fetchStops(currentPage, searchQuery);
            resetForm();
            alert('Cập nhật điểm dừng thành công!');
        } catch (error) {
            console.error('Failed to update stop:', error);
            alert('Không thể cập nhật điểm dừng');
        }
    };

    const handleDeleteStop = async (stopId: string) => {
        if (!confirm('Bạn có chắc muốn xóa điểm dừng này?')) return;

        try {
            await axios.delete(`${API_BASE}/api/stop/${stopId}`);
            // Refresh lại danh sách
            await fetchStops(currentPage, searchQuery);
            alert('Xóa điểm dừng thành công!');
        } catch (error) {
            console.error('Failed to delete stop:', error);
            alert('Không thể xóa điểm dừng');
        }
    };

    const handleEditStop = (stop: Stop) => {
        setFormData(stop);
        setIsEditing(true);
    };

    const resetForm = () => {
        setFormData({
            id: '',
            name: '',
            lat: 0,
            lng: 0,
            type: 'bus_stop',
        });
        setIsEditing(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isEditing) {
            handleUpdateStop();
        } else {
            handleCreateStop();
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-navy mb-2">Quản lý điểm dừng</h1>
                <p className="text-gray-600">
                    Quản lý thông tin điểm dừng xe buýt trong hệ thống
                </p>
            </div>

            {/* Stats - Chỉ hiện Tổng điểm dừng */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-600 mb-1">Tổng điểm dừng</p>
                        <p className="text-3xl font-bold text-navy">{totalStops}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                        <MapPin className="h-6 w-6 text-purple-600" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List View */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Search Bar */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Tìm kiếm theo tên hoặc ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => fetchStops(currentPage, searchQuery)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Stops List - Bỏ cột Địa chỉ */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            ID
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Tên điểm dừng
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Tọa độ
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Thao tác
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center">
                                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                                                <p className="text-sm text-gray-500 mt-2">Đang tải...</p>
                                            </td>
                                        </tr>
                                    ) : stops.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                                {searchQuery ? 'Không tìm thấy điểm dừng nào' : 'Chưa có điểm dừng'}
                                            </td>
                                        </tr>
                                    ) : (
                                        stops.map((stop) => (
                                            <tr
                                                key={stop.id}
                                                className="hover:bg-gray-50 transition-colors"
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-mono text-gray-900">
                                                        {stop.id}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center">
                                                        <MapPin className="h-4 w-4 text-orange mr-2 flex-shrink-0" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {stop.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-xs text-gray-500 font-mono">
                                                        {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEditStop(stop)}
                                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteStop(stop.id)}
                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {!loading && totalPages > 1 && (
                            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                    Hiển thị {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalStops)} trong tổng {totalStops} điểm dừng
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fetchStops(currentPage - 1)}
                                        disabled={currentPage === 1}
                                    >
                                        Trước
                                    </Button>
                                    <div className="flex items-center gap-1">
                                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                            let pageNum;
                                            if (totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (currentPage <= 3) {
                                                pageNum = i + 1;
                                            } else if (currentPage >= totalPages - 2) {
                                                pageNum = totalPages - 4 + i;
                                            } else {
                                                pageNum = currentPage - 2 + i;
                                            }

                                            return (
                                                <Button
                                                    key={pageNum}
                                                    variant={currentPage === pageNum ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => fetchStops(pageNum)}
                                                    className={currentPage === pageNum ? "bg-navy" : ""}
                                                >
                                                    {pageNum}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fetchStops(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                    >
                                        Sau
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Form View */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
                        <h2 className="text-lg font-bold text-navy mb-4">
                            {isEditing ? 'Chỉnh sửa điểm dừng' : 'Thêm điểm dừng mới'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ID điểm dừng
                                </label>
                                <Input
                                    value={formData.id}
                                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                    placeholder="Ví dụ: 101"
                                    required
                                    disabled={isEditing}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên điểm dừng
                                </label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ví dụ: Bến Đường Phan Trọng Tuệ"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Vĩ độ (Lat)
                                    </label>
                                    <Input
                                        type="number"
                                        step="any"
                                        value={formData.lat}
                                        onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                                        placeholder="21.0285"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Kinh độ (Lng)
                                    </label>
                                    <Input
                                        type="number"
                                        step="any"
                                        value={formData.lng}
                                        onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                                        placeholder="105.8542"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Loại
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange"
                                >
                                    <option value="bus_stop">Bus Stop</option>
                                    <option value="station">Station</option>
                                    <option value="terminal">Terminal</option>
                                </select>
                            </div>

                            <div>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="submit"
                                    className="flex-1 bg-navy hover:bg-navy/90"
                                >
                                    {isEditing ? 'Cập nhật' : 'Thêm mới'}
                                </Button>
                                {isEditing && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={resetForm}
                                    >
                                        Hủy
                                    </Button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
