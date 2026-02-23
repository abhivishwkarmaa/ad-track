import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Converts a UTC date to IST date string
 * @param {Date|String} date - UTC Date
 * @param {String} format - Output format
 * @returns {String} IST formatted date
 */
export const toIST = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
    if (!date) return null;
    return dayjs(date).tz(IST_TIMEZONE).format(format);
};

/**
 * Gets the current time in IST
 * @param {String} format - Output format
 * @returns {String} IST formatted date
 */
export const nowIST = (format = 'YYYY-MM-DD HH:mm:ss') => {
    return dayjs().tz(IST_TIMEZONE).format(format);
};

/**
 * Generates UTC boundaries for a given IST date string (YYYY-MM-DD)
 * @param {String} dateFrom - IST start date
 * @param {String} dateTo - IST end date
 * @returns {Object} { utcStart, utcEnd }
 */
export const getUtcBoundaries = (dateFrom, dateTo) => {
    const utcStart = dayjs.tz(`${dateFrom} 00:00:00`, IST_TIMEZONE).utc().format('YYYY-MM-DD HH:mm:ss');
    const utcEnd = dayjs.tz(`${dateTo} 23:59:59`, IST_TIMEZONE).utc().format('YYYY-MM-DD HH:mm:ss');
    return { utcStart, utcEnd };
};

/**
 * Recursively converts all date-like strings in an object to IST
 * @param {Object|Array} data - Data to convert
 * @returns {Object|Array} Converted data
 */
export const convertDatesToIST = (data) => {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(item => convertDatesToIST(item));
    }

    if (typeof data === 'object') {
        const newData = {};
        for (const [key, value] of Object.entries(data)) {
            // Targeted fields that usually contain dates
            const dateFields = ['created_at', 'updated_at', 'timestamp', 'conversion_time', 'click_time', 'assigned_at', 'day', 'date'];

            if (dateFields.includes(key) && value && typeof value === 'string') {
                // If it looks like a date/time string, convert it
                if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
                    newData[key] = toIST(value);
                } else {
                    newData[key] = value;
                }
            } else if (typeof value === 'object') {
                newData[key] = convertDatesToIST(value);
            } else {
                newData[key] = value;
            }
        }
        return newData;
    }

    return data;
};

export default dayjs;
