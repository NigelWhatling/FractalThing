import * as actionTypes from '../actions/actionTypes';

const initialState = {
  active_tasks: 0
};

const info = (state = initialState, action) => {
  switch (action.type) {

    case actionTypes.INC_TASKS:
      state.active_tasks++;
      return state;

    case actionTypes.DEC_TASKS:
      state.active_tasks--;
      return state;

    default:
      return state;
  }
};

export default info;