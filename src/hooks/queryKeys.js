export const queryKeys = {
  dishes: (userId) => ['dishes', userId],
  menus: (userId) => ['daily-menu', userId],
  menu: (userId, date) => ['daily-menu', userId, date],
  sales: (userId) => ['sales', userId],
  salesDay: (userId, date) => ['sales', userId, date],
};
