// The single place the "OFF-0007" convention (prefix + zero-padding) is defined, so the
// PDF's printed Offertenummer, the downloaded/e-mailed filename, and the CSV export can
// never drift into showing a different format for the same quote.
const PAD_WIDTH = 4;

// Falls back to a fragment of the quote's own id for the (expected to be rare/impossible
// post-migration) case of a quote with no sequenceNumber, rather than printing "OFF-null".
export function formatQuoteNumber(quote) {
  if (Number.isInteger(quote.sequenceNumber)) {
    return `OFF-${String(quote.sequenceNumber).padStart(PAD_WIDTH, '0')}`;
  }
  return `OFF-${quote.id.slice(0, 8).toUpperCase()}`;
}
