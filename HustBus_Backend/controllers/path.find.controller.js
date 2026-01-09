const { findNearestStops } = require("../utils/findpathUtils");
const axios = require("axios");
const config = require("../config/env.config");
const { getStopById } = require("../services/stops.service");
const { saveSearchHistory } = require("../config/redis");

/**
 * Calculate haversine distance between two coordinates
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

async function findPaths(req, res) {
  const { from, to, time } = req.body || {};

  if (!from || !to) {
    return res.status(400).json({
      message: "Vui lòng cung cấp điểm đi và điểm đến hợp lệ.",
    });
  }

  // Normalize coordinates - support both array [lat, lng] and object {lat, lng} format
  const normalizeCoords = (coords) => {
    if (Array.isArray(coords)) {
      const [lat, lng] = coords;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return null;
      }
      return { lat, lng };
    }
    if (
      coords &&
      typeof coords.lat === "number" &&
      typeof coords.lng === "number"
    ) {
      return { lat: coords.lat, lng: coords.lng };
    }
    if (
      coords &&
      typeof coords.lat === "number" &&
      typeof coords.lon === "number"
    ) {
      return { lat: coords.lat, lng: coords.lon };
    }
    return null;
  };

  const fromCoords = normalizeCoords(from);
  const toCoords = normalizeCoords(to);

  if (!fromCoords || !toCoords) {
    return res.status(400).json({
      message: "Vui lòng cung cấp toạ độ điểm đi và điểm đến hợp lệ.",
    });
  }

  try {
    // Get nearest stops from origin only, use exact destination coordinates

    const originStops = await findNearestStops(
      fromCoords.lat,
      fromCoords.lng,
      3 // 3 nearest origin stops with unique coordinates
    );

    if (!originStops || originStops.length === 0) {
      return res.status(404).json({
        message: "Không thể xác định trạm xuất phát phù hợp.",
      });
    }

    // Use provided time or default to current time in Vietnam timezone (GMT+7)
    // Validate and adjust time if outside operating hours (before 5 AM or after 21:00)
    let departureTime = time;

    // Helper function to check if time is within operating hours
    const isWithinOperatingHours = (timeStr) => {
      if (!timeStr) return false;
      try {
        const [hours] = timeStr.split(":").map(Number);
        return hours >= 5 && hours < 21; // Operating hours: 05:00 - 21:00
      } catch {
        return false;
      }
    };

    if (!departureTime) {
      // No time provided, use default time 08:00:00
      console.log(
        `⚠️  Không có thời gian từ frontend. Sử dụng thời gian mặc định: 08:00:00`
      );
      departureTime = "08:00:00";
    } else {
      // Time provided by frontend, validate it
      if (!isWithinOperatingHours(departureTime)) {
        const [hours] = departureTime.split(":").map(Number);
        console.log(
          `⚠️  Thời gian từ frontend (${departureTime}) ngoài giờ hoạt động (05:00-21:00). Điều chỉnh thành: 08:00:00`
        );
        departureTime = "08:00:00";
      }
    }

    console.log(`⏰ Thời gian khởi hành: ${departureTime}`);

    // External API configuration from centralized config
    const apiUrl = config.getRoutingApiUrl(
      config.externalApis.routingService.endpoints.findRoute
    );
    const maxTransferValues = config.routeFinding.maxTransferOptions;

    // Create all API calls for each origin stop with exact destination coordinates
    const apiCalls = [];

    for (const originStop of originStops) {
      // Use exact destination coordinates instead of nearest stop
      for (const maxTransfers of maxTransferValues) {
        apiCalls.push({
          originStop,
          destCoords: toCoords,
          maxTransfers,
          promise: axios
            .get(apiUrl, {
              params: {
                lat_from: originStop.lat,
                lon_from: originStop.lng,
                lat_to: toCoords.lat,
                lon_to: toCoords.lng,
                time: departureTime,
                max_transfers: maxTransfers,
              },
            })
            .catch((error) => {
              console.error(
                "API call failed for origin %s to destination (%s, %s) with max_transfers=%s: %s",
                originStop.id,
                toCoords.lat,
                toCoords.lng,
                maxTransfers,
                error.message
              );
              return null;
            }),
        });
      }
    }

    // Also try direct coordinate-to-coordinate routing (without nearest stops)
    // This can find routes that don't start from the nearest 3 stops
    for (const maxTransfers of [1, 2]) {
      apiCalls.push({
        originStop: null, // Direct from coordinates
        originCoords: fromCoords,
        destCoords: toCoords,
        maxTransfers,
        promise: axios
          .get(apiUrl, {
            params: {
              lat_from: fromCoords.lat,
              lon_from: fromCoords.lng,
              lat_to: toCoords.lat,
              lon_to: toCoords.lng,
              time: departureTime,
              max_transfers: maxTransfers,
            },
          })
          .catch((error) => {
            console.error(
              "API call failed for direct coords (%s, %s) to (%s, %s) with max_transfers=%s: %s",
              fromCoords.lat,
              fromCoords.lng,
              toCoords.lat,
              toCoords.lng,
              maxTransfers,
              error.message
            );
            return null;
          }),
      });
    }

    // Wait for all API calls to complete
    const apiResults = await Promise.all(apiCalls.map((call) => call.promise));

    // Process results - need to handle async stop lookups
    const routePromises = [];

    apiResults.forEach((result, index) => {
      if (!result || !result.data) {
        console.log(`⚠️  API call ${index}: No result or no data`);
        return;
      }

      const { originStop, originCoords, destCoords, maxTransfers } =
        apiCalls[index];
      const data = result.data;

      // Debug: Log actual response from FastAPI
      console.log(`\n📡 API call ${index} response:`);
      console.log(
        `   Origin: ${originStop ? originStop.id : "direct"} (${
          originStop ? originStop.lat : originCoords.lat
        }, ${originStop ? originStop.lng : originCoords.lng})`
      );
      console.log(`   Dest: (${destCoords.lat}, ${destCoords.lng})`);
      console.log(`   Max transfers: ${maxTransfers}`);
      console.log(`   Routes count: ${data.routes?.length || 0}`);
      console.log(`   Segments count: ${data.segments?.length || 0}`);

      // Log full response if no routes found
      if (
        !data.routes ||
        !Array.isArray(data.routes) ||
        data.routes.length === 0
      ) {
        console.log(
          `   ⚠️  No routes found. Full response:`,
          JSON.stringify(data, null, 2)
        );
        return; // Skip this API result
      }

      console.log(`   ✅ Found ${data.routes.length} routes`);
      if (data.routes[0]) {
        console.log(`   First route summary: ${data.routes[0].summary}`);
      }

      if (data.routes && Array.isArray(data.routes) && data.routes.length > 0) {
        data.routes.forEach((route, routeIndex) => {
          // Create async function to process segments with stop data
          const processRoute = async () => {
            try {
              // Enrich segments with stop coordinates
              const enrichedSegments = await Promise.all(
                (data.segments || []).map(async (segment) => {
                  try {
                    const fromStop = await getStopById(segment.from_stop);
                    const toStop = await getStopById(segment.to_stop);

                    if (!fromStop) {
                      console.warn(`⚠️  Stop not found: ${segment.from_stop}`);
                    }
                    if (!toStop) {
                      console.warn(`⚠️  Stop not found: ${segment.to_stop}`);
                    }

                    return {
                      ...segment,
                      fromStopName: fromStop?.name,
                      fromStopLat: fromStop?.lat,
                      fromStopLon: fromStop?.lng,
                      toStopName: toStop?.name,
                      toStopLat: toStop?.lat,
                      toStopLon: toStop?.lng,
                      // Add coordinates in ORS-compatible format
                      from_coordinates: fromStop
                        ? {
                            lat: fromStop.lat,
                            lng: fromStop.lng,
                          }
                        : null,
                      to_coordinates: toStop
                        ? {
                            lat: toStop.lat,
                            lng: toStop.lng,
                          }
                        : null,
                    };
                  } catch (error) {
                    console.error(`❌ Error enriching segment:`, error);
                    console.error(`   Segment:`, segment);
                    // Return segment without enrichment if error
                    return segment;
                  }
                })
              );

              // For direct coordinate routes, use route data from API or first segment
              let actualOriginStop;
              if (originStop) {
                actualOriginStop = originStop;
              } else if (route.origin_stop_id) {
                // API returned origin stop info
                actualOriginStop = {
                  id: route.origin_stop_id,
                  name:
                    route.origin_stop_name || enrichedSegments[0]?.fromStopName,
                  lat:
                    route.origin_stop_lat || enrichedSegments[0]?.fromStopLat,
                  lng:
                    route.origin_stop_lon || enrichedSegments[0]?.fromStopLon,
                  distance: route.distance_from_origin || 0,
                };
              } else if (enrichedSegments.length > 0) {
                // Fallback to first segment
                actualOriginStop = {
                  id: enrichedSegments[0].from_stop,
                  name: enrichedSegments[0].fromStopName,
                  lat: enrichedSegments[0].fromStopLat,
                  lng: enrichedSegments[0].fromStopLon,
                  distance: 0,
                };
              }

              const routeIdPrefix = originStop ? originStop.id : "direct";

              return {
                route_id: `${routeIdPrefix}_dest_${maxTransfers}_${routeIndex}`,
                max_transfers: maxTransfers,
                origin_stop: actualOriginStop
                  ? {
                      id: actualOriginStop.id,
                      name: actualOriginStop.name,
                      lat: actualOriginStop.lat,
                      lon: actualOriginStop.lng || actualOriginStop.lon,
                      distance_from_origin: actualOriginStop.distance || 0,
                    }
                  : null,
                destination_coordinates: {
                  lat: destCoords.lat,
                  lng: destCoords.lng,
                },
                summary: route.summary,
                details: route.details,
                segments: enrichedSegments,
              };
            } catch (error) {
              console.error(`❌ Error processing route ${routeIndex}:`, error);
              console.error(`   Route data:`, route);
              console.error(`   API data:`, data);
              // Return null to filter out later
              return null;
            }
          };

          routePromises.push(processRoute());
        });
      }
    });

    // Wait for all routes to be processed
    const allRoutes = await Promise.all(routePromises);

    // Filter out null routes (errors during processing)
    const processedRoutes = allRoutes.filter((route) => route !== null);

    console.log(`📊 Total routes from API: ${allRoutes.length}`);
    console.log(
      `✅ Processed routes (after filtering nulls): ${processedRoutes.length}`
    );

    // Filter out invalid routes
    const validRoutes = processedRoutes.filter(
      (route) => route && route.details && route.details.total_time_sec > 0
    );

    console.log(`✅ Valid routes after filtering: ${validRoutes.length}`);

    // Deduplicate routes by segments (keep only unique route patterns)
    const uniqueRoutesMap = new Map();

    validRoutes.forEach((route) => {
      // Create a signature for this route based on its segments
      const segmentSignature = route.segments
        .map((seg) => seg.lineId || seg.mode || "unknown")
        .filter(Boolean)
        .join("->");

      // If we haven't seen this route pattern, or this one is faster
      if (!uniqueRoutesMap.has(segmentSignature)) {
        uniqueRoutesMap.set(segmentSignature, route);
      } else {
        const existing = uniqueRoutesMap.get(segmentSignature);
        if (route.details.total_time_sec < existing.details.total_time_sec) {
          uniqueRoutesMap.set(segmentSignature, route);
        }
      }
    });

    // Convert map back to array
    const uniqueRoutes = Array.from(uniqueRoutesMap.values());

    console.log(`🔗 Unique routes after deduplication: ${uniqueRoutes.length}`);

    // Add walking segment from origin to first bus stop for each route
    const WALKING_SPEED_M_PER_MIN = 83.33; // 5 km/h = 83.33 m/min
    const FARE_PER_ROUTE = 7000; // 7000 VND per bus route

    uniqueRoutes.forEach((route) => {
      if (!route.segments || route.segments.length === 0) return;

      const firstSegment = route.segments[0];
      const firstStopLat = firstSegment.fromStopLat;
      const firstStopLon = firstSegment.fromStopLon;

      if (firstStopLat && firstStopLon) {
        // Calculate walking distance from origin to first stop
        const distanceKm = haversineDistance(
          fromCoords.lat,
          fromCoords.lng,
          firstStopLat,
          firstStopLon
        );
        const distanceMeters = distanceKm * 1000;
        const durationSec = Math.ceil(
          (distanceMeters / WALKING_SPEED_M_PER_MIN) * 60
        );

        // Create walking segment
        const walkingSegment = {
          mode: "walk",
          from_coordinates: {
            lat: fromCoords.lat,
            lng: fromCoords.lng,
          },
          to_stop: firstSegment.from_stop,
          toStopName: firstSegment.fromStopName,
          toStopLat: firstStopLat,
          toStopLon: firstStopLon,
          to_coordinates: {
            lat: firstStopLat,
            lng: firstStopLon,
          },
          duration_sec: durationSec,
          duration_min: Math.ceil(durationSec / 60),
          distance_meters: Math.round(distanceMeters),
          fare: 0, // No fare for walking
        };

        // Prepend walking segment to route
        route.segments.unshift(walkingSegment);
      }

      // Add walking segment from last bus stop to destination
      const lastSegment = route.segments[route.segments.length - 1];
      const lastStopLat = lastSegment.toStopLat;
      const lastStopLon = lastSegment.toStopLon;

      if (lastStopLat && lastStopLon) {
        // Calculate walking distance from last stop to destination
        const distanceKm = haversineDistance(
          lastStopLat,
          lastStopLon,
          toCoords.lat,
          toCoords.lng
        );
        const distanceMeters = distanceKm * 1000;
        const durationSec = Math.ceil(
          (distanceMeters / WALKING_SPEED_M_PER_MIN) * 60
        );

        // Create final walking segment
        const finalWalkingSegment = {
          mode: "walk",
          from_stop: lastSegment.to_stop,
          fromStopName: lastSegment.toStopName,
          fromStopLat: lastStopLat,
          fromStopLon: lastStopLon,
          from_coordinates: {
            lat: lastStopLat,
            lng: lastStopLon,
          },
          to_coordinates: {
            lat: toCoords.lat,
            lng: toCoords.lng,
          },
          toStopName: "Điểm đến",
          duration_sec: durationSec,
          duration_min: Math.ceil(durationSec / 60),
          distance_meters: Math.round(distanceMeters),
          fare: 0, // No fare for walking
        };

        // Append final walking segment to route
        route.segments.push(finalWalkingSegment);
      }

      // Recalculate all time values from actual segments
      // This ensures total_time_sec = walking_time_sec + transit_time_sec + waiting_time_sec
      let totalWalkingTime = 0;
      let totalTransitTime = 0;
      let totalWaitingTime = 0;

      route.segments.forEach((seg, index) => {
        const segDuration = seg.duration_sec || 0;
        if (seg.mode === "walk") {
          totalWalkingTime += segDuration;
        } else if (seg.mode === "bus") {
          totalTransitTime += segDuration;
        }

        // Add waiting time from segment if provided
        if (seg.waiting_time_sec) {
          totalWaitingTime += seg.waiting_time_sec;
        }
      });

      // Get waiting time from route details (from routing service)
      // If not provided in details or segments, use calculated value
      const waitingTime =
        route.details?.waiting_time_sec || totalWaitingTime || 0;

      // Update route details with recalculated times
      if (route.details) {
        route.details.walking_time_sec = totalWalkingTime;
        route.details.transit_time_sec = totalTransitTime;
        route.details.waiting_time_sec = waitingTime;
        route.details.total_time_sec =
          totalWalkingTime + totalTransitTime + waitingTime;
      }

      // Calculate total fare based on number of unique bus routes
      const busSegments = route.segments.filter((seg) => seg.mode === "bus");
      const uniqueBusLines = new Set(busSegments.map((seg) => seg.lineId));
      const totalFare = uniqueBusLines.size * FARE_PER_ROUTE;

      // Add fare to each bus segment
      route.segments.forEach((seg) => {
        if (seg.mode === "bus") {
          seg.fare = FARE_PER_ROUTE;
        }
      });

      // Add total fare to route details
      if (route.details) {
        route.details.total_fare = totalFare;
      }
    });

    // Calculate and assign filter tags
    // Filter out walking-only routes (routes with no transit segments)
    const transitRoutes = uniqueRoutes.filter((route) => {
      const hasTransit = route.segments.some((seg) => seg.mode !== "walk");
      return hasTransit;
    });

    if (transitRoutes.length > 0) {
      // Find fastest route
      const fastestRoute = transitRoutes.reduce((min, route) =>
        (route.details?.total_time_sec || Infinity) <
        (min.details?.total_time_sec || Infinity)
          ? route
          : min
      );
      fastestRoute.filters = fastestRoute.filters || [];
      if (!fastestRoute.filters.includes("fastest")) {
        fastestRoute.filters.push("fastest");
      }

      // Find route with fewest transfers
      const fewestTransfersRoute = transitRoutes.reduce((min, route) =>
        (route.details?.transfers_count || Infinity) <
        (min.details?.transfers_count || Infinity)
          ? route
          : min
      );
      fewestTransfersRoute.filters = fewestTransfersRoute.filters || [];
      if (!fewestTransfersRoute.filters.includes("fewest_transfers")) {
        fewestTransfersRoute.filters.push("fewest_transfers");
      }

      // Find route with least walking
      const leastWalkingRoute = transitRoutes.reduce((min, route) => {
        const walkingTime = route.details?.walking_time_sec || Infinity;
        const minWalkingTime = min.details?.walking_time_sec || Infinity;
        return walkingTime < minWalkingTime ? route : min;
      });
      leastWalkingRoute.filters = leastWalkingRoute.filters || [];
      if (!leastWalkingRoute.filters.includes("least_walking")) {
        leastWalkingRoute.filters.push("least_walking");
      }
    }

    if (uniqueRoutes.length === 0) {
      console.log(`❌ No routes found. Debug info:`);
      console.log(`   - All routes from API: ${allRoutes.length}`);
      console.log(`   - Valid routes: ${validRoutes.length}`);
      console.log(`   - Unique routes: ${uniqueRoutes.length}`);
      console.log(
        `   - API results:`,
        apiResults.map((r, i) => ({
          index: i,
          hasData: !!r?.data,
          routesCount: r?.data?.routes?.length || 0,
          segmentsCount: r?.data?.segments?.length || 0,
        }))
      );

      return res.status(404).json({
        message: "Không tìm thấy lộ trình xe buýt phù hợp.",
        origin: {
          lat: fromCoords.lat,
          lng: fromCoords.lng,
        },
        destination: {
          lat: toCoords.lat,
          lng: toCoords.lng,
        },
        nearest_origin_stops: originStops.map((s) => ({
          id: s.id,
          name: s.name,
          distance: Math.round(s.distance),
        })),
        debug: {
          allRoutesCount: allRoutes.length,
          validRoutesCount: validRoutes.length,
          uniqueRoutesCount: uniqueRoutes.length,
        },
      });
    }

    // Sort routes by total time (fastest first)
    uniqueRoutes.sort((a, b) => {
      const timeA = a.details.total_time_sec || Infinity;
      const timeB = b.details.total_time_sec || Infinity;
      return timeA - timeB;
    });

    // Log search history for authenticated users
    console.log("🔍 Checking authentication for history save...");
    console.log("req.user:", req.user);

    const userId = req.user?.sub || req.user?.id;

    if (userId) {
      console.log(
        "✅ User authenticated, saving search history for user ID:",
        userId
      );

      // Create labels from coordinates or nearest stops
      const fromLabel =
        originStops.length > 0
          ? `Gần ${originStops[0].name}`
          : `${fromCoords.lat.toFixed(4)}, ${fromCoords.lng.toFixed(4)}`;

      const toLabel = `${toCoords.lat.toFixed(4)}, ${toCoords.lng.toFixed(4)}`;

      // Save to Redis asynchronously (don't wait)
      saveSearchHistory(userId.toString(), {
        from: {
          label: fromLabel,
          coords: fromCoords,
        },
        to: {
          label: toLabel,
          coords: toCoords,
        },
      })
        .then((success) => {
          if (success) {
            console.log("✅ Search history saved successfully to Redis");
          } else {
            console.log("ℹ️ Search history not saved (Redis not available)");
          }
        })
        .catch((err) => {
          console.error("❌ Failed to save search history:", err);
        });
    } else {
      console.log("ℹ️ User not authenticated, skipping history save");
    }

    // Return response
    return res.json({
      from: {
        lat: fromCoords.lat,
        lng: fromCoords.lng,
      },
      to: {
        lat: toCoords.lat,
        lng: toCoords.lng,
      },
      departure_time: departureTime,
      total_routes_found: uniqueRoutes.length,
      routes: uniqueRoutes,
      origin_info: {
        coordinates: {
          lat: fromCoords.lat,
          lng: fromCoords.lng,
        },
        nearest_stops: originStops.map((s) => ({
          id: s.id,
          name: s.name,
          distance_meters: Math.round(s.distance),
        })),
      },
      destination_info: {
        coordinates: {
          lat: toCoords.lat,
          lng: toCoords.lng,
        },
        type: "exact_coordinates",
      },
    });
  } catch (error) {
    console.error("Error in findPaths:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

/**
 * Save search history to Redis
 * POST /api/path/save-history
 * Body: {
 *   fromLabel: string,
 *   toLabel: string,
 *   fromCoords: { lat, lng },
 *   toCoords: { lat, lng }
 * }
 */
async function saveSearchToHistory(req, res) {
  try {
    const userId = req.user?.sub || req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Yêu cầu đăng nhập để lưu lịch sử." });
    }

    const { fromLabel, toLabel, fromCoords, toCoords } = req.body;

    if (!fromLabel || !toLabel || !fromCoords || !toCoords) {
      return res.status(400).json({
        message: "Thiếu thông tin: fromLabel, toLabel, fromCoords, toCoords",
      });
    }

    console.log("💾 Saving search history for user:", userId);
    console.log("From:", fromLabel, fromCoords);
    console.log("To:", toLabel, toCoords);

    const success = await saveSearchHistory(userId.toString(), {
      from: {
        label: fromLabel,
        coords: fromCoords,
      },
      to: {
        label: toLabel,
        coords: toCoords,
      },
    });

    if (success) {
      console.log("✅ History saved successfully");
      return res.status(201).json({
        message: "Đã lưu lịch sử tìm kiếm.",
        success: true,
      });
    } else {
      console.log("❌ Failed to save history");
      return res.status(500).json({
        message: "Không thể lưu lịch sử tìm kiếm.",
        success: false,
      });
    }
  } catch (error) {
    console.error("Error in saveSearchToHistory:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

module.exports = {
  findPaths,
  saveSearchToHistory,
};
