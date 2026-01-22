import Box from '@mui/material/Box';

type InfoPanelProps = {
  nav: {
    x: number;
    y: number;
    z: number;
  };
  tasks: number;
};

const InfoPanel = ({ nav, tasks }: InfoPanelProps) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        padding: 1.25,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 2,
      }}
    >
      <Box
        component="table"
        sx={{
          color: 'white',
          fontSize: 12,
          borderSpacing: 0,
          '& th': {
            textAlign: 'left',
          },
          '& td': {
            textAlign: 'right',
            minWidth: 50,
            paddingLeft: 1.25,
          },
        }}
      >
        <tbody>
          <tr>
            <th>X</th>
            <td>{nav.x}</td>
          </tr>
          <tr>
            <th>Y</th>
            <td>{nav.y}</td>
          </tr>
          <tr>
            <th>Z</th>
            <td>{nav.z}</td>
          </tr>
          <tr>
            <th>Tasks</th>
            <td>{tasks}</td>
          </tr>
        </tbody>
      </Box>
    </Box>
  );
};

export default InfoPanel;
