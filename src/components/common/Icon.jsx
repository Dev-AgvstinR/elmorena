import {
  FiArrowLeft, FiBookOpen, FiCalendar, FiCheckCircle, FiClock,
  FiDollarSign, FiEdit2, FiEyeOff, FiLogIn, FiLogOut, FiPlus, FiRepeat,
  FiSave, FiShoppingBag, FiSunset, FiTrash2, FiUserPlus, FiX, FiHome, FiPackage,
} from 'react-icons/fi';
import { LuUtensils, LuGlassWater } from 'react-icons/lu';

const icons = {
  back: FiArrowLeft, history: FiBookOpen, calendar: FiCalendar, check: FiCheckCircle,
  pending: FiClock, dish: LuUtensils, cash: FiDollarSign, edit: FiEdit2,
  hide: FiEyeOff, login: FiLogIn, plus: FiPlus, transfer: FiRepeat,
  save: FiSave, order: FiShoppingBag, finish: FiSunset, delete: FiTrash2,
  register: FiUserPlus, cancel: FiX,
  home: FiHome, stock: FiPackage, drink: LuGlassWater, logout: FiLogOut,
};
export default function Icon({ name, className = '' }) {
  const Component = icons[name];
  return Component ? <Component className={`libreta-icon ${className}`} aria-hidden="true" focusable="false" /> : null;
}
