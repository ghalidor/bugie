import '../../driver/data/driver_repository.dart';
import '../../driver/domain/driver_model.dart';
import '../../payments/data/payments_repository.dart';
import '../../payments/domain/payment_model.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';

/// Repositorio del pasajero. No habla con APIs propias — orquesta los
/// repositorios que ya existen (trips, drivers, payments).
/// Esto mantiene cada módulo enfocado en su API.
class PassengerRepository {
  final TripsRepository _trips;
  final DriverRepository _drivers;
  final PaymentsRepository _payments;

  PassengerRepository(this._trips, this._drivers, this._payments);

  Future<Trip?> getActiveTrip() => _trips.getActive();
  Future<List<Trip>> getHistory() => _trips.getHistory();
  Future<List<Payment>> getMyPayments() => _payments.getMyPayments();

  Future<List<NearbyDriver>> getNearbyDrivers(double lat, double lng) =>
      _drivers.getNearby(lat: lat, lng: lng);
}
