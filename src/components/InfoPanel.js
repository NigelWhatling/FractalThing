import React from 'react';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  infoBlock: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8
  },
  infoTable: {
    color: 'white',
    fontSize: 12,
    borderSpacing: 0,
    '& th': {
      textAlign: 'left'
    },
    '& td': {
      textAlign: 'right',
      minWidth: 50,
      paddingLeft: 10,
    }
  }
}));

const InfoPanel = ({ nav, tasks }) => {

  const classes = useStyles();

  return (
    <div>
      <div className={classes.infoBlock}>
        <table className={classes.infoTable}>
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
        </table>
      </div>
    </div>
  );
}

export default InfoPanel;
