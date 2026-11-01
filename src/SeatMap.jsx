import { gridTracks } from './utils';

// 결과 자리표. teacherView면 상하·좌우를 모두 뒤집는다 (교사가 교탁에서 학생 쪽을 바라본 방향).
export default function SeatMap({ seats, cols, rows, colGaps, rowGaps, roster, teacherView, variant }) {
  const cg = teacherView ? [...colGaps].reverse() : colGaps;
  const rg = teacherView ? [...rowGaps].reverse() : rowGaps;
  const cells = [];

  for (let dr = 0; dr < rows; dr++) {
    for (let dc = 0; dc < cols; dc++) {
      const r = teacherView ? rows - 1 - dr : dr;
      const c = teacherView ? cols - 1 - dc : dc;
      const seat = seats[r * cols + c];
      if (!seat) continue;
      const joinL = dc > 0 && !cg[dc - 1];
      const joinR = dc < cols - 1 && !cg[dc];
      const cls = [
        'sm-cell',
        seat.status === 'excluded' ? 'excluded' : '',
        seat.status === 'fixed' ? 'fixed' : '',
        joinL ? 'join-l' : '',
        joinR ? 'join-r' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const pos = { gridRow: dr * 2 + 1, gridColumn: dc * 2 + 1 };
      const n = seat.studentNum;
      const name = n && roster ? roster[n] : null;

      let content;
      if (seat.status === 'excluded') content = <span className="sm-x">빈자리</span>;
      else if (!n) content = <span className="sm-x">-</span>;
      else if (name)
        content = (
          <>
            <span className="sm-num-small">{n}번</span>
            <span className="sm-name">{name}</span>
          </>
        );
      else content = <span className="sm-num-big">{n}</span>;

      cells.push(
        <div key={`${r}-${c}`} className={cls} style={pos}>
          {content}
        </div>,
      );
    }
  }

  return (
    <div
      className={`seatmap seatmap-${variant}`}
      style={{
        gridTemplateColumns: gridTracks(cols, cg, 'minmax(0, 1fr)', 'var(--sm-join)', 'var(--sm-aisle)'),
        gridTemplateRows: gridTracks(
          rows,
          rg,
          variant === 'display' ? 'minmax(0, 1fr)' : 'auto',
          'var(--sm-row)',
          'var(--sm-row-aisle)',
        ),
      }}
    >
      {cells}
    </div>
  );
}
