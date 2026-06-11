const express = require('express');

const {
  addBeneficiary,
  addCustomerAccount,
  createUser,
  getBeneficiaries,
  getCustomers,
  getMyProfile,
  getUsers,
  removeBeneficiary,
  updateMyProfile,
  updateUser,
  updateUserStatus,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorize('admin'), getUsers);
router.get('/customers', protect, authorize('admin', 'manager'), getCustomers);
router.get('/me', protect, getMyProfile);
router.patch('/me', protect, updateMyProfile);
router.get('/beneficiaries', protect, authorize('customer'), getBeneficiaries);
router.post('/beneficiaries', protect, authorize('customer'), addBeneficiary);
router.delete('/beneficiaries/:id', protect, authorize('customer'), removeBeneficiary);
router.post('/', protect, authorize('admin'), createUser);
router.post('/:id/accounts', protect, authorize('admin'), addCustomerAccount);
router.patch('/:id/status', protect, authorize('admin'), updateUserStatus);
router.patch('/:id', protect, authorize('admin'), updateUser);

module.exports = router;
