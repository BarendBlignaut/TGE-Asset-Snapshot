function extractLatestSnapshot(events) {
  const snapshotEvents = events.filter((event) => {
    const eventType = String(event.type || "").toUpperCase();
    const eventAction = String(event.action || "").toUpperCase();
    return eventType === "CAMERA" && eventAction === "SNAPSHOT";
  });

  if (!snapshotEvents.length) {
    return {
      snapshotTime: null,
      links: [],
      rawEvent: null,
    };
  }

  snapshotEvents.sort((a, b) => {
    const aTime = new Date(a.timeAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.timeAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const latestSnapshot = snapshotEvents[0];
  const context = safeParseJson(latestSnapshot.attributes?.context);
  const mediaFiles = Array.isArray(context?.response?.mediaFiles)
    ? context.response.mediaFiles
    : [];

  const links = mediaFiles.map((item) => ({
    source: item.source || null,
    mediaType: item.mediaType || null,
    mediaFile: item.mediaFile || null,
    status: item.status || null,
    sources: Array.isArray(item.imageDetails?.sources) ? item.imageDetails.sources : [],
  }));

  return {
    snapshotTime: latestSnapshot.timeAt || latestSnapshot.createdAt || null,
    links,
    rawEvent: latestSnapshot,
  };
}
