const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../config/prisma');

// Configure storage to save to backend uploads (served by Express static)
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatar');

// Ensure directory exists
if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, AVATAR_DIR);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: userId-timestamp.ext
        const userId = req.user.sub;
        const ext = path.extname(file.originalname);
        const filename = `${userId}-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (JPG, PNG, WebP)'), false);
    }
};

// Configure multer with 3MB limit
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 3 * 1024 * 1024 // 3MB in bytes
    }
});

/**
 * Upload user avatar
 * @route POST /api/upload/avatar
 * @access Protected
 */
exports.uploadAvatar = [
    upload.single('avatar'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    message: 'Vui lòng chọn file ảnh để upload.'
                });
            }

            const userId = req.user.sub;

            // Sanitize filename to prevent path traversal
            const sanitizedFilename = path.basename(req.file.filename);
            // Serve via backend static: /uploads/avatar/<file>
            const avatarPath = `/uploads/avatar/${sanitizedFilename}`;
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const avatarUrl = `${baseUrl}${avatarPath}`;

            // Get old avatar path to delete old file
            const user = await prisma.users.findUnique({
                where: { id: userId },
                select: { path_url: true }
            });

            // Update user avatar path in database
            await prisma.users.update({
                where: { id: userId },
                // Store absolute URL so FE can always load regardless of which domain serves FE
                data: { path_url: avatarUrl }
            });

            // Delete old avatar file if exists
            if (user?.path_url) {
                // Support both legacy relative paths and new absolute URL paths
                const legacyPrefix = '/assets/avatar/';
                const newPrefix = '/uploads/avatar/';
                const pathOnly = (() => {
                    if (user.path_url.startsWith('http://') || user.path_url.startsWith('https://')) {
                        try {
                            return new URL(user.path_url).pathname;
                        } catch {
                            return user.path_url;
                        }
                    }
                    return user.path_url;
                })();

                if (pathOnly.startsWith(legacyPrefix) || pathOnly.startsWith(newPrefix)) {
                    const oldFilename = path.basename(pathOnly);
                    const oldFilePath = path.join(AVATAR_DIR, oldFilename);

                    // Validate path is within expected directory
                    const resolvedPath = path.resolve(oldFilePath);
                    const expectedDir = path.resolve(AVATAR_DIR);

                    if (resolvedPath.startsWith(expectedDir) && fs.existsSync(oldFilePath)) {
                        try {
                            fs.unlinkSync(oldFilePath);
                        } catch (err) {
                            console.error('Failed to delete old avatar:', err);
                        }
                    }
                }
            }

            res.json({
                message: 'Upload ảnh đại diện thành công!',
                avatarUrl
            });

        } catch (error) {
            // Delete uploaded file if database update fails
            if (req.file) {
                // Sanitize filename to prevent path traversal
                const sanitizedFilename = path.basename(req.file.filename);
                const filePath = path.join(AVATAR_DIR, sanitizedFilename);

                // Validate path is within expected directory
                const resolvedPath = path.resolve(filePath);
                const expectedDir = path.resolve(AVATAR_DIR);

                if (resolvedPath.startsWith(expectedDir) && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            console.error('Avatar upload error:', error);

            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    message: 'File ảnh quá lớn. Kích thước tối đa 3MB.'
                });
            }

            res.status(500).json({
                message: error.message || 'Không thể upload ảnh. Vui lòng thử lại.'
            });
        }
    }
];
