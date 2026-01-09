const stopsService = require("../services/stops.service");
const { getVietnamISOString } = require('../utils/vietnamTime');

module.exports = {
    // GET /stops?page=1&limit=100&search=query
    async getAllStops(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 100;
            const skip = (page - 1) * limit;
            const search = req.query.search || '';

            const result = await stopsService.getAllStops(skip, limit, search);
            res.json(result);
        } catch (err) {
            console.error("Error fetching stops:", err.message);
            res.status(500).json({ error: "Failed to fetch stops" });
        }
    },

    // GET /stops/:id
    async getStopById(req, res) {
        const { id } = req.params;

        try {
            const stop = await stopsService.getStopById(id);
            if (!stop) {
                return res.status(404).json({ error: "Stop not found" });
            }
            res.json(stop);
        } catch (err) {
            console.error("Error fetching stop:", err.message);
            res.status(500).json({ error: "Failed to fetch stop" });
        }
    },

    // POST /stops
    async createStop(req, res) {
        const { id, name, lat, lng, type } = req.body;

        try {
            const newStop = await stopsService.createStop({
                id,
                name,
                lat,
                lng,
                type
            });

            res.status(201).json(newStop);
        } catch (err) {
            console.error("Error creating stop:", err.message);
            res.status(500).json({ error: "Failed to create stop" });
        }
    },

    // PUT /stops/:id
    async updateStop(req, res) {
        const { id } = req.params;
        const { name, lat, lng, type } = req.body;

        try {
            // NOTE: Prisma model `stops` currently has no `address` column.
            // Only pass fields that exist in the schema.
            const updatedStop = await stopsService.updateStop(id, {
                name,
                lat,
                lng,
                type
            });

            if (!updatedStop) {
                return res.status(404).json({ error: "Stop not found" });
            }

            res.json(updatedStop);
        } catch (err) {
            console.error("Error updating stop:", err.message);
            res.status(500).json({ error: "Failed to update stop" });
        }
    },

    // DELETE /stops/:id
    async deleteStop(req, res) {
        const { id } = req.params;

        try {
            const deleted = await stopsService.deleteStop(id);

            if (!deleted) {
                return res.status(404).json({ error: "Stop not found" });
            }

            res.json({ success: true, message: "Stop deleted successfully" });
        } catch (err) {
            console.error("Error deleting stop:", err.message);
            res.status(500).json({ error: "Failed to delete stop" });
        }
    },

    // GET /stops/:id/times
    async getStopWithTimes(req, res) {
        const { id } = req.params;

        try {
            const stop = await stopsService.getStopWithTimes(id);
            if (!stop) {
                return res.status(404).json({ error: "Stop not found" });
            }

            res.json(stop);
        } catch (err) {
            console.error("Error fetching stop times:", err.message);
            res.status(500).json({ error: "Failed to fetch stop times" });
        }
    },

    // GET /stops/:id/arrivals
    async getStopArrivals(req, res) {
        const { id } = req.params;

        try {
            const routes = await stopsService.getRoutesWithArrivals(id);
            res.json({
                stopId: id,
                routes,
                timestamp: getVietnamISOString()
            });
        } catch (err) {
            console.error("Error fetching stop arrivals:", err.message);
            res.status(500).json({ error: "Failed to fetch stop arrivals" });
        }
    }
};
