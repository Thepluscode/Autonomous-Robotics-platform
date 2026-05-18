import { useCallback, useEffect, useRef, useState } from "react";
import { provenanceAPI } from "../lib/api";

// Batch hook for /gaia-prime's zone attestation surface. The page renders
// the same data two ways (table on md+, cards on mobile), so the fetch
// logic lives once here rather than in each row component. Per-row retry
// is supported because individual zones can fail independently and the
// auditor surface should not collapse on one bad zone.

const blankRow = (zone) => ({
  zone,
  data: null,
  loading: Boolean(zone && zone.id),
  error: null,
});

export function useZoneAttestations(zones, { hours = 168 } = {}) {
  const [rows, setRows] = useState(() => (zones || []).map(blankRow));
  const cancelRef = useRef(false);

  const fetchOne = useCallback(
    (zone, index) => {
      if (!zone || !zone.id) {
        setRows((prev) =>
          prev.map((r, i) => (i === index ? { ...r, loading: false } : r))
        );
        return;
      }
      setRows((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, loading: true, error: null } : r
        )
      );
      provenanceAPI
        .getZoneAttestation(zone.id, hours)
        .then((res) => {
          if (cancelRef.current) return;
          setRows((prev) =>
            prev.map((r, i) =>
              i === index
                ? { ...r, data: res.data, loading: false, error: null }
                : r
            )
          );
        })
        .catch((err) => {
          if (cancelRef.current) return;
          setRows((prev) =>
            prev.map((r, i) =>
              i === index ? { ...r, loading: false, error: err } : r
            )
          );
        });
    },
    [hours]
  );

  useEffect(() => {
    cancelRef.current = false;
    const next = (zones || []).map(blankRow);
    setRows(next);
    (zones || []).forEach((zone, i) => fetchOne(zone, i));
    return () => {
      cancelRef.current = true;
    };
    // zones is a referentially-new array on every parent render; the parent
    // memoizes it. eslint can't see that across files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones]);

  const retry = useCallback(
    (index) => {
      const row = rows[index];
      if (!row) return;
      fetchOne(row.zone, index);
    },
    [fetchOne, rows]
  );

  return { rows, retry };
}
