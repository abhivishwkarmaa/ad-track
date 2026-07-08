/**
 * Pure offer validation (no I/O).
 */

export function checkOfferValidity(offer) {
  if (!offer) {
    return {
      valid: false,
      message: 'Offer not found',
      error_type: 'offer_not_found',
    };
  }

  if (offer.status !== 'live') {
    return {
      valid: false,
      message: `Offer is not live. Current status: ${offer.status}. Only live offers can accept traffic.`,
      error_type: 'offer_not_live',
    };
  }

  const now = new Date();

  if (offer.end_date) {
    const endDate = new Date(offer.end_date);
    endDate.setHours(23, 59, 59, 999);

    if (now > endDate) {
      return {
        valid: false,
        message: `Offer has expired. End date: ${offer.end_date}. The offer is no longer accepting traffic.`,
        error_type: 'offer_expired',
      };
    }
  }

  if (offer.start_date) {
    const startDate = new Date(offer.start_date);
    startDate.setHours(0, 0, 0, 0);

    if (now < startDate) {
      return {
        valid: false,
        message: `Offer has not started yet. Start date: ${offer.start_date}. The offer will become active on this date.`,
        error_type: 'offer_not_started',
      };
    }
  }

  return {
    valid: true,
    message: 'Offer is valid and active',
    error_type: null,
  };
}

export function validateOfferDatesAndStatus(offerData, existingOffer = null) {
  const now = new Date();

  const endDate = offerData.end_date || (existingOffer ? existingOffer.end_date : null);
  if (endDate) {
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    if (now > endDateObj) {
      return {
        valid: false,
        message: `Offer has expired. End date (${endDate}) has already passed. Cannot create or update expired offers.`,
        error_type: 'offer_expired',
      };
    }
  }

  const status = offerData.status || (existingOffer ? existingOffer.status : null);
  if (status === 'live' && endDate) {
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    if (now > endDateObj) {
      return {
        valid: false,
        message: `Cannot set offer status to 'live': Offer has expired. End date (${endDate}) has already passed.`,
        error_type: 'offer_expired',
      };
    }
  }

  return {
    valid: true,
    message: 'Offer validation passed',
    error_type: null,
  };
}

/**
 * IST time-of-day window for offers (conversion + click parity).
 * Call after {@link checkOfferValidity}; does not re-check status/dates.
 * Supports overnight windows when start_time > end_time (e.g. 22:00–06:00).
 */

function normalizeTimeValue(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim();
  const parts = s.split(':');
  if (parts.length < 2) return s;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const sec = (parts[2] || '00').split('.')[0].padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function isOutsideTimeWindow(currentTime, startTime, endTime) {
  if (!startTime && !endTime) return false;
  const cur = normalizeTimeValue(currentTime);
  const start = normalizeTimeValue(startTime);
  const end = normalizeTimeValue(endTime);

  if (start && end) {
    if (start <= end) {
      return cur < start || cur > end;
    }
    // Overnight: allowed from start → midnight OR midnight → end
    return cur < start && cur > end;
  }
  if (start) return cur < start;
  if (end) return cur > end;
  return false;
}

export function validateConversionSchedule(offer) {
  if (!offer) {
    return { valid: false, message: 'Offer not found', error_type: 'offer_not_found' };
  }

  const now = new Date();
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const currentTime = istTime.toISOString().split('T')[1].split('.')[0];

  if (offer.start_time && offer.end_time) {
    const startTime = normalizeTimeValue(offer.start_time);
    const endTime = normalizeTimeValue(offer.end_time);
    if (isOutsideTimeWindow(currentTime, startTime, endTime)) {
      return {
        valid: false,
        message: `Outside allowed time window (${startTime}–${endTime} IST). Current: ${currentTime}`,
        error_type: 'offer_time_restricted',
      };
    }
  } else if (offer.start_time) {
    const startTime = normalizeTimeValue(offer.start_time);
    if (isOutsideTimeWindow(currentTime, startTime, null)) {
      return {
        valid: false,
        message: `Before allowed start time (${startTime} IST). Current: ${currentTime}`,
        error_type: 'offer_time_restricted',
      };
    }
  } else if (offer.end_time) {
    const endTime = normalizeTimeValue(offer.end_time);
    if (isOutsideTimeWindow(currentTime, null, endTime)) {
      return {
        valid: false,
        message: `After allowed end time (${endTime} IST). Current: ${currentTime}`,
        error_type: 'offer_time_restricted',
      };
    }
  }

  return { valid: true, message: 'OK', error_type: null };
}
