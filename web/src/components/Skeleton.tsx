export const SkeletonTable = ({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) => (
  <div className="table-wrap" aria-hidden="true">
    <table>
      <tbody>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex}>
            {Array.from({ length: columns }, (_, columnIndex) => (
              <td key={columnIndex}>
                <span
                  className="skeleton"
                  style={{
                    width: `${[68, 46, 54, 38, 60][(rowIndex + columnIndex) % 5]}%`,
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const SkeletonMetrics = ({ count = 4 }: { count?: number }) => (
  <div className="metrics" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div className="card metric" key={index}>
        <span className="skeleton skeleton--label" />
        <span className="skeleton skeleton--value" />
      </div>
    ))}
  </div>
);

export const SkeletonList = ({ rows = 4 }: { rows?: number }) => (
  <ul className="tasks__list" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <li className="tasks__item" key={index}>
        <span className="skeleton skeleton--check" />
        <div className="tasks__body">
          <span
            className="skeleton"
            style={{ width: `${[62, 48, 70, 55][index % 4]}%` }}
          />
          <span className="skeleton skeleton--meta" />
        </div>
      </li>
    ))}
  </ul>
);

export const LoadingAnnouncement = () => (
  <span className="visually-hidden" role="status">
    Wird geladen
  </span>
);
