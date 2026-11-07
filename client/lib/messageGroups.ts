type Row = { _id: string; senderId?: { _id: string } | null };

// Whether a message joins up with the ones around it, like Instagram: same
// sender, with no date or time divider between them. Rows are newest first,
// like the chat list, so the previous message is the next row.
export function messageGrouping(rows: Row[], index: number) {
  const sender = rows[index].senderId?._id;
  const sameSender = (row?: Row) => !!sender && row?.senderId?._id === sender;
  return { withPrevious: sameSender(rows[index + 1]), withNext: sameSender(rows[index - 1]) };
}
