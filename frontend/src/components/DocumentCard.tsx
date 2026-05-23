interface DocumentCardProps {
  title?: string;
  dateUploaded?: string;
  source?: string;
  lastAiReviewed?: string;
  onAiReview?: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
}

export default function DocumentCard({
  title = 'Document Title',
  dateUploaded,
  source,
  lastAiReviewed,
  onAiReview,
  onReplace,
  onRemove,
}: DocumentCardProps) {
  return (
    <div className="document-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-semibold text-gray-800 mb-1">{title}</p>
          {dateUploaded && (
            <p className="text-sm text-gray-600 mb-1">Date Uploaded: {dateUploaded}</p>
          )}
          {source && (
            <p className="text-sm text-gray-600">Source: {source}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          {lastAiReviewed && (
            <p className="text-sm text-gray-600 mb-1">Last AI Reviewed: {lastAiReviewed}</p>
          )}
          {onAiReview && (
            <button className="rounded-button" onClick={onAiReview}>
              AI Review
            </button>
          )}
          {onReplace && (
            <button className="rounded-button" onClick={onReplace}>
              Replace
            </button>
          )}
          {onRemove && (
            <button className="rounded-button" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
