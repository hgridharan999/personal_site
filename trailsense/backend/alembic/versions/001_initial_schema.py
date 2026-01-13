"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-01-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('name', sa.String()),
        sa.Column('profile', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('gear_inventory', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('current_fatigue', sa.DECIMAL(3, 2), server_default='0.0'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'))
    )
    op.create_index('idx_users_email', 'users', ['email'], unique=True)

    op.create_table(
        'trails',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('region', sa.String()),
        sa.Column('trailhead_lat', sa.DECIMAL(9, 6), nullable=False),
        sa.Column('trailhead_lon', sa.DECIMAL(9, 6), nullable=False),
        sa.Column('trailhead_elevation', sa.Integer()),
        sa.Column('highest_point_elevation', sa.Integer()),
        sa.Column('distance_miles', sa.DECIMAL(5, 2), nullable=False),
        sa.Column('elevation_gain_ft', sa.Integer(), nullable=False),
        sa.Column('trail_type', sa.String()),
        sa.Column('difficulty', sa.String()),
        sa.Column('technical_class', sa.Integer(), server_default='1'),
        sa.Column('exposure_level', sa.Integer(), server_default='1'),
        sa.Column('terrain_types', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('features', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('typical_crowd_level', sa.Integer(), server_default='3'),
        sa.Column('dogs_allowed', sa.Boolean(), server_default='true'),
        sa.Column('fee_required', sa.Boolean(), server_default='false'),
        sa.Column('best_months', postgresql.ARRAY(sa.Integer()), server_default='{}'),
        sa.Column('estimated_time_hours', sa.DECIMAL(4, 2)),
        sa.Column('route_description', sa.Text()),
        sa.Column('required_gear', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('photos', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('now()'))
    )
    op.create_index('idx_trails_difficulty', 'trails', ['difficulty'])
    op.create_index('idx_trails_distance', 'trails', ['distance_miles'])

    op.create_table(
        'weather_forecasts',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('trail_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('location_type', sa.String(), nullable=False),
        sa.Column('forecast_date', sa.Date(), nullable=False),
        sa.Column('forecast_hour', sa.Integer(), nullable=False),
        sa.Column('temperature_f', sa.Integer()),
        sa.Column('precipitation_prob', sa.Integer()),
        sa.Column('precipitation_type', sa.String()),
        sa.Column('wind_speed_mph', sa.Integer()),
        sa.Column('wind_gust_mph', sa.Integer()),
        sa.Column('sky_cover', sa.Integer()),
        sa.Column('weather_summary', sa.String()),
        sa.Column('fetched_at', sa.TIMESTAMP(), server_default=sa.text('now()'))
    )
    op.create_foreign_key(
        'fk_weather_forecasts_trail_id',
        'weather_forecasts', 'trails',
        ['trail_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_index('idx_weather_trail_date', 'weather_forecasts', ['trail_id', 'forecast_date'])


def downgrade() -> None:
    op.drop_index('idx_weather_trail_date', table_name='weather_forecasts')
    op.drop_constraint('fk_weather_forecasts_trail_id', 'weather_forecasts', type_='foreignkey')
    op.drop_table('weather_forecasts')

    op.drop_index('idx_trails_distance', table_name='trails')
    op.drop_index('idx_trails_difficulty', table_name='trails')
    op.drop_table('trails')

    op.drop_index('idx_users_email', table_name='users')
    op.drop_table('users')
