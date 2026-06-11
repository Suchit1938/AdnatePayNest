import { Inbox } from "lucide-react";

const EmptyState = ({ message }) => (
  <div className="empty-state">
    <Inbox className="mx-auto mb-3 text-bank-eyebrow" size={24} />
    <p>{message}</p>
  </div>
);

export default EmptyState;
