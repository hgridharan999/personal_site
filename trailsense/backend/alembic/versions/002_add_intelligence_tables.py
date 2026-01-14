"""add intelligence tables

Revision ID: 002
Revises: 001
Create Date: 2026-01-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'trail_conditions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('trail_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('trails.id', ondelete='CASCADE'), nullable=False),
        sa.Column('report_date', sa.Date(), nullable=False),
        sa.Column('snow_level_ft', sa.Integer(), nullable=True),
        sa.Column('trail_status', sa.String(), nullable=True),
        sa.Column('mud_level', sa.String(), nullable=True),
        sa.Column('water_crossing_status', sa.String(), nullable=True),
        sa.Column('hazards', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('required_gear', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('difficulty_sentiment', sa.String(), nullable=True),
        sa.Column('overall_sentiment', sa.String(), nullable=True),
        sa.Column('source', sa.String(), nullable=True),
        sa.Column('source_url', sa.String(), nullable=True),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('confidence', sa.DECIMAL(3, 2), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('NOW()'))
    )
    op.create_index('idx_conditions_trail_date', 'trail_conditions', ['trail_id', sa.text('report_date DESC')])

    op.create_table(
        'assessments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('trail_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('trails.id', ondelete='CASCADE'), nullable=False),
        sa.Column('assessment_date', sa.Date(), nullable=False),
        sa.Column('confidence_score', sa.DECIMAL(5, 2), nullable=False),
        sa.Column('recommendation', sa.String(), nullable=False),
        sa.Column('breakdown', postgresql.JSONB(), nullable=False),
        sa.Column('concerns', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('NOW()'))
    )
    op.create_index('idx_assessments_user', 'assessments', ['user_id', sa.text('created_at DESC')])
    op.create_index('idx_assessments_trail', 'assessments', ['trail_id'])

    op.create_table(
        'hike_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('trail_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('trails.id', ondelete='SET NULL'), nullable=True),
        sa.Column('trail_name', sa.String(), nullable=True),
        sa.Column('hike_date', sa.Date(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.Column('difficulty_rating', sa.Integer(), nullable=True),
        sa.Column('time_taken_hours', sa.DECIMAL(4, 2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('NOW()'))
    )
    op.create_index('idx_hike_logs_user', 'hike_logs', ['user_id', sa.text('hike_date DESC')])


def downgrade() -> None:
    op.drop_index('idx_hike_logs_user', table_name='hike_logs')
    op.drop_table('hike_logs')

    op.drop_index('idx_assessments_trail', table_name='assessments')
    op.drop_index('idx_assessments_user', table_name='assessments')
    op.drop_table('assessments')

    op.drop_index('idx_conditions_trail_date', table_name='trail_conditions')
    op.drop_table('trail_conditions')
